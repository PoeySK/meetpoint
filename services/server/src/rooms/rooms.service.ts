import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { JoinParticipantDto } from './dto/join-participant.dto';
import { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import {
  Candidate,
  CandidatePlace,
  CandidateStatus,
  CandidateTime,
} from './entities/candidate.entity';
import {
  AvailabilityStatus,
  ParticipantResponse,
  ParticipantResponseStatus,
  TravelBurden,
} from './entities/participant-response.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_CANDIDATES = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type NormalizedCreateRoomInput = {
  title: string;
  timezone: string;
  displayName: string;
};

type NormalizedCandidateInput = {
  displayOrder: number;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
};

export interface PublicParticipant {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
}

export interface RoomPayload {
  id: string;
  roomCode: string;
  title: string;
  timezone: string;
  status: RoomStatus;
  hostParticipantId: string;
  maxParticipants: number;
  latestScoreResultId: string | null;
  currentDecisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedRoomResponse {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  access: {
    hostToken: string;
    inviteUrl: string;
  };
}

export interface RoomDetailsResponse {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: CandidatePayload[];
  latestScoreResult: null;
  decision: null;
}

export interface CandidatePayload {
  id: string;
  roomId: string;
  displayOrder: number;
  status: CandidateStatus;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
  version: number;
  archivedAt: Date | null;
}

export interface CreatedCandidateResponse {
  requestId: string;
  candidate: CandidatePayload;
}

export interface ParticipantResponsePayload {
  id: string;
  participantId: string;
  candidateId: string;
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
  status: ParticipantResponseStatus;
  submittedAt: Date;
  updatedAt: Date;
}

export interface UpsertedParticipantResponse {
  requestId: string;
  response: ParticipantResponsePayload;
  participantStatus: ParticipantStatus;
  scoreResultStatus: 'STALE';
}

export interface JoinedParticipantResponse {
  requestId: string;
  room: {
    id: string;
    roomCode: string;
    status: RoomStatus;
  };
  participant: PublicParticipant;
  access: {
    participantToken: string;
  };
}

@Injectable()
export class RoomsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createRoom(input: CreateRoomDto): Promise<CreatedRoomResponse> {
    const normalizedInput = this.validateCreateRoomInput(input);
    const roomId = randomUUID();
    const hostParticipantId = randomUUID();
    const hostToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(hostToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

    let created:
      { room: Room; participant: Participant; roomCode: string } | undefined;

    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = this.generateRoomCode();

      try {
        created = await this.dataSource.transaction(
          async (manager: EntityManager) => {
            const roomRepository = manager.getRepository(Room);
            const participantRepository = manager.getRepository(Participant);
            const room = roomRepository.create({
              id: roomId,
              roomCode,
              title: normalizedInput.title,
              timezone: normalizedInput.timezone,
              status: RoomStatus.DRAFT,
              hostParticipantId,
              maxParticipants: 6,
              latestScoreResultId: null,
              currentDecisionId: null,
            });

            const savedRoom = await roomRepository.save(room);

            const participant = participantRepository.create({
              id: hostParticipantId,
              roomId,
              displayName: normalizedInput.displayName,
              role: ParticipantRole.HOST,
              status: ParticipantStatus.JOINED,
              tokenHash,
              tokenExpiresAt,
              tokenRevokedAt: null,
            });

            this.assertHostParticipant(savedRoom, participant);
            const savedParticipant =
              await participantRepository.save(participant);
            this.assertHostParticipant(savedRoom, savedParticipant);

            return {
              room: savedRoom,
              participant: savedParticipant,
              roomCode,
            };
          }
        );
        break;
      } catch (error) {
        if (!this.isRoomCodeConflict(error)) {
          throw error;
        }
      }
    }

    if (!created) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    return {
      requestId: this.createRequestId(),
      room: this.toRoomPayload(created.room),
      hostParticipant: this.toPublicParticipant(created.participant),
      access: {
        hostToken,
        inviteUrl: this.createInviteUrl(created.roomCode),
      },
    };
  }

  async joinParticipant(
    roomCode: string,
    input: JoinParticipantDto
  ): Promise<JoinedParticipantResponse> {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const displayName = this.validateJoinParticipantInput(input);
    const participantId = randomUUID();
    const participantToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(participantToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

    const joined = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const room = await roomRepository.findOne({
          where: { roomCode: normalizedRoomCode },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('ROOM_NOT_FOUND_OR_INVALID_CODE');
        }

        if (
          room.status !== RoomStatus.DRAFT &&
          room.status !== RoomStatus.OPEN
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const participants = await participantRepository.find({
          where: { roomId: room.id },
        });
        const activeParticipantCount = participants.filter(
          (participant) =>
            participant.status !== ParticipantStatus.LEFT &&
            participant.status !== ParticipantStatus.REMOVED
        ).length;

        if (activeParticipantCount >= room.maxParticipants) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        if (room.status === RoomStatus.DRAFT) {
          room.status = RoomStatus.OPEN;
        }

        const participant = participantRepository.create({
          id: participantId,
          roomId: room.id,
          displayName,
          role: ParticipantRole.MEMBER,
          status: ParticipantStatus.JOINED,
          tokenHash,
          tokenExpiresAt,
          tokenRevokedAt: null,
        });

        const savedRoom = await roomRepository.save(room);
        const savedParticipant = await participantRepository.save(participant);

        return { room: savedRoom, participant: savedParticipant };
      }
    );

    return {
      requestId: this.createRequestId(),
      room: {
        id: joined.room.id,
        roomCode: joined.room.roomCode,
        status: joined.room.status,
      },
      participant: this.toPublicParticipant(joined.participant),
      access: {
        participantToken,
      },
    };
  }

  async createCandidate(
    roomId: string,
    accessToken: string | undefined,
    input: CreateCandidateDto
  ): Promise<CreatedCandidateResponse> {
    const actor = await this.getAuthorizedParticipant(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const normalizedInput = this.validateCandidateInput(input);
    const created = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const candidateRepository = manager.getRepository(Candidate);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        this.assertCandidateRoomEditable(room);

        const activeCandidates = await candidateRepository.find({
          where: { roomId: room.id, status: CandidateStatus.ACTIVE },
        });
        if (activeCandidates.length >= MAX_ACTIVE_CANDIDATES) {
          throw new UnprocessableEntityException('CANDIDATE_LIMIT_EXCEEDED');
        }

        if (
          activeCandidates.some((candidate) =>
            this.isDuplicateCandidate(candidate, normalizedInput)
          )
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        if (
          room.status === RoomStatus.DRAFT ||
          room.status === RoomStatus.CALCULATED
        ) {
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const candidate = candidateRepository.create({
          id: randomUUID(),
          roomId: room.id,
          displayOrder: normalizedInput.displayOrder,
          time: normalizedInput.time,
          place: normalizedInput.place,
          estimatedCostPerPersonKrw: normalizedInput.estimatedCostPerPersonKrw,
          tags: normalizedInput.tags,
          status: CandidateStatus.ACTIVE,
          version: 1,
          archivedAt: null,
          createdByParticipantId: actor.participant.id,
        });
        const savedCandidate = await candidateRepository.save(candidate);

        return savedCandidate;
      }
    );

    return {
      requestId: this.createRequestId(),
      candidate: this.toCandidatePayload(created),
    };
  }

  async upsertParticipantResponse(
    roomId: string,
    participantId: string,
    candidateId: string,
    accessToken: string | undefined,
    input: UpsertParticipantResponseDto
  ): Promise<UpsertedParticipantResponse> {
    const actor = await this.getAuthorizedParticipant(roomId, accessToken);
    if (actor.participant.id !== participantId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedInput = this.validateParticipantResponseInput(input);
    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const candidateRepository = manager.getRepository(Candidate);
        const responseRepository = manager.getRepository(ParticipantResponse);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        this.assertCandidateRoomEditable(room);

        const candidate = await candidateRepository.findOne({
          where: { id: candidateId },
        });
        if (!candidate || candidate.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        if (candidate.status === CandidateStatus.ARCHIVED) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const participant = await participantRepository.findOneBy({
          id: participantId,
        });
        if (!participant || participant.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        if (room.status === RoomStatus.CALCULATED) {
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const existing = await responseRepository.findOne({
          where: { participantId, candidateId },
        });
        const response =
          existing ??
          responseRepository.create({
            id: randomUUID(),
            roomId: room.id,
            participantId,
            candidateId,
            status: ParticipantResponseStatus.SUBMITTED,
            submittedAt: new Date(),
          });

        response.availabilityStatus = normalizedInput.availabilityStatus;
        response.travelBurden = normalizedInput.travelBurden;
        response.note = normalizedInput.note;
        response.status = ParticipantResponseStatus.SUBMITTED;

        return {
          response: await responseRepository.save(response),
          participantStatus: participant.status,
        };
      }
    );

    return {
      requestId: this.createRequestId(),
      response: this.toParticipantResponsePayload(saved.response),
      participantStatus: saved.participantStatus,
      scoreResultStatus: 'STALE',
    };
  }

  async getRoom(
    roomId: string,
    accessToken?: string
  ): Promise<RoomDetailsResponse> {
    const { room } = await this.getAuthorizedParticipant(roomId, accessToken);
    const participantRepository = this.dataSource.getRepository(Participant);

    const participants = await participantRepository.find({
      where: { roomId: room.id },
      order: { joinedAt: 'ASC' },
    });
    const candidates = await this.dataSource.getRepository(Candidate).find({
      where: { roomId: room.id, status: CandidateStatus.ACTIVE },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const hostParticipant = participants.find(
      (participant) => participant.id === room.hostParticipantId
    );

    if (!hostParticipant) {
      throw new InternalServerErrorException(
        '호스트 참여자를 찾을 수 없습니다.'
      );
    }
    this.assertHostParticipant(room, hostParticipant);

    return {
      requestId: this.createRequestId(),
      room: this.toRoomPayload(room),
      hostParticipant: this.toPublicParticipant(hostParticipant),
      participants: participants.map((participant) =>
        this.toPublicParticipant(participant)
      ),
      candidates: candidates.map((candidate) =>
        this.toCandidatePayload(candidate)
      ),
      latestScoreResult: null,
      decision: null,
    };
  }

  private async getAuthorizedParticipant(
    roomId: string,
    accessToken?: string
  ): Promise<{ room: Room; participant: Participant }> {
    if (!accessToken) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }

    const participantRepository = this.dataSource.getRepository(Participant);
    const roomRepository = this.dataSource.getRepository(Room);
    const participant = await participantRepository.findOneBy({
      tokenHash: this.hashToken(accessToken),
    });

    if (!participant) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    if (
      participant.tokenRevokedAt ||
      participant.tokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('TOKEN_EXPIRED');
    }

    const room = await roomRepository.findOneBy({ id: roomId });
    if (!room || participant.roomId !== room.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    return { room, participant };
  }

  private assertCandidateRoomEditable(room: Room): void {
    if (
      room.status === RoomStatus.CONFIRMED ||
      room.status === RoomStatus.CLOSED
    ) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }
  }

  private validateCandidateInput(
    input: CreateCandidateDto
  ): NormalizedCandidateInput {
    const candidate = input as unknown as {
      displayOrder?: unknown;
      time?: {
        startsAt?: unknown;
        endsAt?: unknown;
        timezone?: unknown;
      };
      place?: {
        name?: unknown;
        address?: unknown;
        area?: unknown;
      };
      estimatedCostPerPersonKrw?: unknown;
      tags?: unknown;
    };
    const startsAt = candidate.time?.startsAt;
    const endsAt = candidate.time?.endsAt;
    const timezone = candidate.time?.timezone;
    const placeName = candidate.place?.name;
    const address = candidate.place?.address;
    const area = candidate.place?.area;
    const tags = candidate.tags;

    if (
      typeof candidate.displayOrder !== 'number' ||
      !Number.isInteger(candidate.displayOrder) ||
      candidate.displayOrder < 1
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (
      typeof startsAt !== 'string' ||
      typeof endsAt !== 'string' ||
      typeof timezone !== 'string'
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      typeof placeName !== 'string' ||
      placeName.trim().length < 1 ||
      placeName.trim().length > 120 ||
      typeof address !== 'string' ||
      address.trim().length < 1 ||
      address.trim().length > 120 ||
      typeof area !== 'string' ||
      area.trim().length < 1
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      typeof candidate.estimatedCostPerPersonKrw !== 'number' ||
      !Number.isInteger(candidate.estimatedCostPerPersonKrw) ||
      candidate.estimatedCostPerPersonKrw < 0 ||
      candidate.estimatedCostPerPersonKrw > 2_000_000
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      !Array.isArray(tags) ||
      tags.length > 10 ||
      tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return {
      displayOrder: candidate.displayOrder,
      time: { startsAt, endsAt, timezone },
      place: {
        name: placeName.trim(),
        address: address.trim(),
        area: area.trim(),
      },
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: tags.map((tag) => (tag as string).trim().toUpperCase()),
    };
  }

  private validateParticipantResponseInput(
    input: UpsertParticipantResponseDto
  ): {
    availabilityStatus: AvailabilityStatus;
    travelBurden: TravelBurden;
    note: string | null;
  } {
    const candidate = input as unknown as {
      availabilityStatus?: unknown;
      travelBurden?: unknown;
      note?: unknown;
    };
    const availabilityStatus = candidate.availabilityStatus;
    const travelBurden = candidate.travelBurden;

    if (
      !Object.values(AvailabilityStatus).includes(
        availabilityStatus as AvailabilityStatus
      ) ||
      !Object.values(TravelBurden).includes(travelBurden as TravelBurden)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (
      candidate.note !== undefined &&
      candidate.note !== null &&
      (typeof candidate.note !== 'string' || candidate.note.trim().length > 300)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return {
      availabilityStatus: availabilityStatus as AvailabilityStatus,
      travelBurden: travelBurden as TravelBurden,
      note: typeof candidate.note === 'string' ? candidate.note.trim() : null,
    };
  }

  private isDuplicateCandidate(
    candidate: Candidate,
    input: NormalizedCandidateInput
  ): boolean {
    return (
      candidate.time.startsAt === input.time.startsAt &&
      candidate.time.endsAt === input.time.endsAt &&
      candidate.time.timezone === input.time.timezone &&
      candidate.place.name === input.place.name &&
      candidate.place.address === input.place.address &&
      candidate.place.area === input.place.area
    );
  }

  private validateCreateRoomInput(
    input: CreateRoomDto
  ): NormalizedCreateRoomInput {
    const candidate = input as unknown as {
      title?: unknown;
      timezone?: unknown;
      host?: { displayName?: unknown };
    };
    const title =
      typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const timezone =
      typeof candidate.timezone === 'string' ? candidate.timezone.trim() : '';
    const displayName =
      typeof candidate.host?.displayName === 'string'
        ? candidate.host.displayName.trim()
        : '';

    if (!title || title.length > 80) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (!displayName || displayName.length > 30) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return { title, timezone, displayName };
  }

  private validateJoinParticipantInput(input: JoinParticipantDto): string {
    const candidate = input as unknown as { displayName?: unknown };
    const displayName =
      typeof candidate.displayName === 'string'
        ? candidate.displayName.trim()
        : '';

    if (!displayName || displayName.length > 30) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return displayName;
  }

  private assertHostParticipant(room: Room, participant: Participant): void {
    if (
      room.hostParticipantId !== participant.id ||
      participant.roomId !== room.id ||
      participant.role !== ParticipantRole.HOST
    ) {
      throw new InternalServerErrorException(
        '호스트 참여자와 방의 소속 정보가 일치하지 않습니다.'
      );
    }
  }

  private generateRoomCode(): string {
    let roomCode = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const randomIndex = randomBytes(1)[0] % ROOM_CODE_ALPHABET.length;
      roomCode += ROOM_CODE_ALPHABET[randomIndex];
    }
    return roomCode;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createInviteUrl(roomCode: string): string {
    const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
    return `${clientOrigin.replace(/\/$/, '')}/join/${roomCode}`;
  }

  private createRequestId(): string {
    return `req_${randomUUID()}`;
  }

  private isRoomCodeConflict(error: unknown): boolean {
    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = candidate.code ?? candidate.driverError?.code;
    const constraint =
      candidate.constraint ?? candidate.driverError?.constraint;

    return (
      code === '23505' &&
      (constraint === undefined ||
        (typeof constraint === 'string' &&
          constraint.toLowerCase().includes('room')))
    );
  }

  private toRoomPayload(room: Room): RoomPayload {
    return {
      id: room.id,
      roomCode: room.roomCode,
      title: room.title,
      timezone: room.timezone,
      status: room.status,
      hostParticipantId: room.hostParticipantId,
      maxParticipants: room.maxParticipants,
      latestScoreResultId: room.latestScoreResultId,
      currentDecisionId: room.currentDecisionId,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private toCandidatePayload(candidate: Candidate): CandidatePayload {
    return {
      id: candidate.id,
      roomId: candidate.roomId,
      displayOrder: candidate.displayOrder,
      status: candidate.status,
      time: candidate.time,
      place: candidate.place,
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: [...candidate.tags],
      version: candidate.version,
      archivedAt: candidate.archivedAt,
    };
  }

  private toParticipantResponsePayload(
    response: ParticipantResponse
  ): ParticipantResponsePayload {
    return {
      id: response.id,
      participantId: response.participantId,
      candidateId: response.candidateId,
      availabilityStatus: response.availabilityStatus,
      travelBurden: response.travelBurden,
      note: response.note,
      status: response.status,
      submittedAt: response.submittedAt,
      updatedAt: response.updatedAt,
    };
  }

  private toPublicParticipant(participant: Participant): PublicParticipant {
    return {
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role,
      status: participant.status,
    };
  }
}

import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinParticipantDto } from './dto/join-participant.dto';
import { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import {
  ParticipantResponse,
  ParticipantResponseStatus,
} from './entities/participant-response.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { ScoreResult, ScoreResultStatus } from './entities/score-result.entity';
import { RoomCalculationService } from './calculation/room-calculation.service';
import { getAuthorizedParticipant, hashAccessToken } from './room-access';
import { toCandidatePayload } from './room-payload';
import {
  createRequestId,
  toParticipantResponsePayload,
  toPublicParticipant,
  toRoomPayload,
  type CalculationResponse,
  type CreatedCandidateResponse,
  type CreatedRoomResponse,
  type JoinedParticipantResponse,
  type LatestScoreResultResponse,
  type RoomDetailsResponse,
  type StartCalculationResponse,
  type UpsertedParticipantResponse,
} from './room-response';
import {
  assertHostParticipant,
  isDuplicateCandidate,
  validateCandidateInput,
  validateCreateRoomInput,
  validateJoinParticipantInput,
  validateParticipantResponseInput,
} from './room-validation';
import type { StartCalculationDto } from './dto/start-calculation.dto';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_CANDIDATES = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RoomsService {
  private readonly calculationService: RoomCalculationService;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.calculationService = new RoomCalculationService(dataSource);
  }

  async createRoom(input: CreateRoomDto): Promise<CreatedRoomResponse> {
    const normalizedInput = validateCreateRoomInput(input);
    const roomId = randomUUID();
    const hostParticipantId = randomUUID();
    const hostToken = randomBytes(32).toString('base64url');
    const tokenHash = hashAccessToken(hostToken);
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

            assertHostParticipant(savedRoom, participant);
            const savedParticipant =
              await participantRepository.save(participant);
            assertHostParticipant(savedRoom, savedParticipant);

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
      requestId: createRequestId(),
      room: toRoomPayload(created.room),
      hostParticipant: toPublicParticipant(created.participant),
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
    const displayName = validateJoinParticipantInput(input);
    const participantId = randomUUID();
    const participantToken = randomBytes(32).toString('base64url');
    const tokenHash = hashAccessToken(participantToken);
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
      requestId: createRequestId(),
      room: {
        id: joined.room.id,
        roomCode: joined.room.roomCode,
        status: joined.room.status,
      },
      participant: toPublicParticipant(joined.participant),
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

    const normalizedInput = validateCandidateInput(input);
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
            isDuplicateCandidate(candidate, normalizedInput)
          )
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        await this.markLatestScoreResultStale(manager, room);
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
        return candidateRepository.save(candidate);
      }
    );

    return {
      requestId: createRequestId(),
      candidate: toCandidatePayload(created),
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

    const normalizedInput = validateParticipantResponseInput(input);
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

        await this.markLatestScoreResultStale(manager, room);
        if (room.status === RoomStatus.CALCULATED) {
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const existing = await responseRepository.findOne({
          where: { roomId: room.id, participantId, candidateId },
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
      requestId: createRequestId(),
      response: toParticipantResponsePayload(saved.response),
      participantStatus: saved.participantStatus,
      scoreResultStatus: 'STALE',
    };
  }

  startCalculation(
    roomId: string,
    accessToken: string | undefined,
    input: StartCalculationDto
  ): Promise<StartCalculationResponse> {
    return this.calculationService.startCalculation(roomId, accessToken, input);
  }

  getCalculation(
    roomId: string,
    calculationId: string,
    accessToken: string | undefined
  ): Promise<CalculationResponse> {
    return this.calculationService.getCalculation(
      roomId,
      calculationId,
      accessToken
    );
  }

  getLatestScoreResult(
    roomId: string,
    accessToken: string | undefined
  ): Promise<LatestScoreResultResponse> {
    return this.calculationService.getLatestScoreResult(roomId, accessToken);
  }

  async getRoom(
    roomId: string,
    accessToken?: string
  ): Promise<RoomDetailsResponse> {
    const { room, participant: currentParticipant } =
      await this.getAuthorizedParticipant(roomId, accessToken);
    const participantRepository = this.dataSource.getRepository(Participant);
    const responseRepository =
      this.dataSource.getRepository(ParticipantResponse);

    const participants = await participantRepository.find({
      where: { roomId: room.id },
      order: { joinedAt: 'ASC' },
    });
    const candidates = await this.dataSource.getRepository(Candidate).find({
      where: { roomId: room.id, status: CandidateStatus.ACTIVE },
      order: { displayOrder: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    const activeCandidateIds = new Set(
      candidates.map((candidate) => candidate.id)
    );
    const currentParticipantResponses = await responseRepository.find({
      where: {
        roomId: room.id,
        participantId: currentParticipant.id,
      },
    });
    const responseByCandidateId = new Map(
      currentParticipantResponses
        .filter(
          (response) =>
            response.roomId === room.id &&
            response.participantId === currentParticipant.id &&
            activeCandidateIds.has(response.candidateId)
        )
        .map((response) => [response.candidateId, response])
    );
    const myResponses = candidates.flatMap((candidate) => {
      const response = responseByCandidateId.get(candidate.id);
      return response ? [toParticipantResponsePayload(response)] : [];
    });
    const hostParticipant = participants.find(
      (participant) => participant.id === room.hostParticipantId
    );

    if (!hostParticipant) {
      throw new InternalServerErrorException(
        '호스트 참가자를 찾을 수 없습니다.'
      );
    }
    assertHostParticipant(room, hostParticipant);

    return {
      requestId: createRequestId(),
      room: toRoomPayload(room),
      hostParticipant: toPublicParticipant(hostParticipant),
      participants: participants.map((participant) =>
        toPublicParticipant(participant)
      ),
      candidates: candidates.map((candidate) => toCandidatePayload(candidate)),
      myResponses,
      latestScoreResult: null,
      decision: null,
    };
  }

  private async getAuthorizedParticipant(
    roomId: string,
    accessToken?: string
  ): Promise<{ room: Room; participant: Participant }> {
    return getAuthorizedParticipant(this.dataSource, roomId, accessToken);
  }

  private assertCandidateRoomEditable(room: Room): void {
    if (
      room.status === RoomStatus.CALCULATING ||
      room.status === RoomStatus.CONFIRMED ||
      room.status === RoomStatus.CLOSED
    ) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }
  }

  private async markLatestScoreResultStale(
    manager: EntityManager,
    room: Room
  ): Promise<void> {
    if (!room.latestScoreResultId) {
      return;
    }

    const scoreResultRepository = manager.getRepository(ScoreResult);
    const scoreResult = await scoreResultRepository.findOneBy({
      id: room.latestScoreResultId,
      roomId: room.id,
    });
    if (scoreResult && scoreResult.status === ScoreResultStatus.COMPLETED) {
      scoreResult.status = ScoreResultStatus.STALE;
      await scoreResultRepository.save(scoreResult);
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

  private createInviteUrl(roomCode: string): string {
    const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
    return `${clientOrigin.replace(/\/$/, '')}/join/${roomCode}`;
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
}

export type {
  CalculationPayload,
  CalculationResponse,
  CalculationSummary,
  CreatedCandidateResponse,
  CreatedRoomResponse,
  JoinedParticipantResponse,
  LatestScoreResultResponse,
  ParticipantResponsePayload,
  PublicParticipant,
  RoomDetailsResponse,
  RoomPayload,
  StartCalculationResponse,
  UpsertedParticipantResponse,
} from './room-response';

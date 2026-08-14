import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
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
import { JoinParticipantDto } from './dto/join-participant.dto';
import { Room, RoomStatus } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type NormalizedCreateRoomInput = {
  title: string;
  timezone: string;
  displayName: string;
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
  candidates: [];
  latestScoreResult: null;
  decision: null;
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

  async getRoom(
    roomId: string,
    accessToken?: string
  ): Promise<RoomDetailsResponse> {
    if (!accessToken) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }

    const participantRepository = this.dataSource.getRepository(Participant);
    const roomRepository = this.dataSource.getRepository(Room);
    const tokenParticipant = await participantRepository.findOneBy({
      tokenHash: this.hashToken(accessToken),
    });

    if (!tokenParticipant) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    if (
      tokenParticipant.tokenRevokedAt ||
      tokenParticipant.tokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('TOKEN_EXPIRED');
    }

    const room = await roomRepository.findOneBy({ id: roomId });
    if (!room || tokenParticipant.roomId !== room.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    const participants = await participantRepository.find({
      where: { roomId: room.id },
      order: { joinedAt: 'ASC' },
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
      candidates: [],
      latestScoreResult: null,
      decision: null,
    };
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

  private toPublicParticipant(participant: Participant): PublicParticipant {
    return {
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role,
      status: participant.status,
    };
  }
}

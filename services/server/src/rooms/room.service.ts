import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinParticipantDto } from './dto/join-participant.dto';
import { Room, RoomStatus } from './entities/room.entity';
import { hashAccessToken } from './room-access';
import {
  createRequestId,
  toPublicParticipant,
  toRoomPayload,
  type CreatedRoomResponse,
  type JoinedParticipantResponse,
} from './room-response';
import {
  assertHostParticipant,
  validateCreateRoomInput,
  validateJoinParticipantInput,
} from './room-validation';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RoomService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
            participant.status === ParticipantStatus.JOINED ||
            participant.status === ParticipantStatus.RESPONDED
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

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { ACCESS_TOKEN, type AccessTokenPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import {
  ParticipantRole,
  ParticipantStatus,
  type ParticipantRecord,
} from '../../domain/participant/participant';
import { RoomStatus, type RoomRecord } from '../../domain/room/room-status';
import {
  assertHostParticipant,
  validateCreateRoomInput,
} from './input-validation';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class CreateRoomUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ACCESS_TOKEN) private readonly accessToken: AccessTokenPort
  ) {}

  async execute(input: unknown) {
    const normalizedInput = validateCreateRoomInput(input);
    const roomId = randomUUID();
    const hostParticipantId = randomUUID();
    const issuedToken = this.accessToken.issue();

    let created:
      | { room: RoomRecord; participant: ParticipantRecord; roomCode: string }
      | undefined;

    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = this.generateRoomCode();
      try {
        created = await this.persistence.transaction(
          async ({ rooms, participants }) => {
            const now = new Date();
            const room: RoomRecord = {
              id: roomId,
              roomCode,
              title: normalizedInput.title,
              timezone: normalizedInput.timezone,
              status: RoomStatus.DRAFT,
              hostParticipantId,
              maxParticipants: 6,
              latestScoreResultId: null,
              currentDecisionId: null,
              createdAt: now,
              updatedAt: now,
            };
            const savedRoom = await rooms.save(room);
            const participant: ParticipantRecord = {
              id: hostParticipantId,
              roomId,
              displayName: normalizedInput.displayName,
              role: ParticipantRole.HOST,
              status: ParticipantStatus.JOINED,
              tokenHash: issuedToken.tokenHash,
              tokenExpiresAt: issuedToken.tokenExpiresAt,
              tokenRevokedAt: null,
              joinedAt: now,
              updatedAt: now,
            };

            assertHostParticipant(savedRoom, participant);
            const savedParticipant = await participants.save(participant);
            assertHostParticipant(savedRoom, savedParticipant);

            return { room: savedRoom, participant: savedParticipant, roomCode };
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
      room: created.room,
      participant: created.participant,
      hostToken: issuedToken.token,
      inviteUrl: this.createInviteUrl(created.roomCode),
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

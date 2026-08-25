import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ACCESS_TOKEN, type AccessTokenPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import {
  ParticipantRole,
  ParticipantStatus,
  isActiveParticipant,
  type ParticipantRecord,
} from '../../domain/participant/participant';
import { RoomStatus } from '../../domain/room/room-status';
import { validateJoinParticipantInput } from './input-validation';

@Injectable()
export class JoinParticipantUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ACCESS_TOKEN) private readonly accessToken: AccessTokenPort
  ) {}

  async execute(roomCode: string, input: unknown) {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const displayName = validateJoinParticipantInput(input);
    const participantId = randomUUID();
    const issuedToken = this.accessToken.issue();

    const joined = await this.persistence.transaction(
      async ({ rooms, participants }) => {
        const room = await rooms.findByCode(normalizedRoomCode, { lock: true });
        if (!room) {
          throw new NotFoundException('ROOM_NOT_FOUND_OR_INVALID_CODE');
        }
        if (
          room.status !== RoomStatus.DRAFT &&
          room.status !== RoomStatus.OPEN
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const activeParticipantCount = (
          await participants.findByRoomId(room.id)
        ).filter(isActiveParticipant).length;
        if (activeParticipantCount >= room.maxParticipants) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const now = new Date();
        const joinedRoom =
          room.status === RoomStatus.DRAFT
            ? { ...room, status: RoomStatus.OPEN, updatedAt: now }
            : room;
        const participant: ParticipantRecord = {
          id: participantId,
          roomId: room.id,
          displayName,
          role: ParticipantRole.MEMBER,
          status: ParticipantStatus.JOINED,
          tokenHash: issuedToken.tokenHash,
          tokenExpiresAt: issuedToken.tokenExpiresAt,
          tokenRevokedAt: null,
          joinedAt: now,
          updatedAt: now,
        };

        const savedRoom =
          joinedRoom === room ? room : await rooms.save(joinedRoom);
        const savedParticipant = await participants.save(participant);
        return { room: savedRoom, participant: savedParticipant };
      }
    );

    return {
      room: joined.room,
      participant: joined.participant,
      participantToken: issuedToken.token,
    };
  }
}

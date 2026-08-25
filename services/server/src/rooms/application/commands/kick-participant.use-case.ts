import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ParticipantRole,
  ParticipantStatus,
  isActiveParticipant,
} from '../../domain/participant/participant';
import { RoomStatus } from '../../domain/room/room-status';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { isRoomEditable } from '../../domain/room/room-state';
import { markLatestScoreResultStale } from '../room-score-state';

@Injectable()
export class KickParticipantUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    targetParticipantId: string,
    accessToken: string | undefined
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const changed = await this.persistence.transaction(async (repositories) => {
      const { rooms, participants } = repositories;
      const room = await rooms.findById(roomId, { lock: true });
      if (!room) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }

      const actorParticipant = await participants.findById(
        actor.participant.id
      );
      if (
        !actorParticipant ||
        actorParticipant.roomId !== room.id ||
        actorParticipant.role !== ParticipantRole.HOST ||
        room.hostParticipantId !== actorParticipant.id
      ) {
        throw new ForbiddenException('HOST_ONLY');
      }
      if (!isActiveParticipant(actorParticipant)) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const target = await participants.findById(targetParticipantId);
      if (!target || target.roomId !== room.id) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (!isRoomEditable(room)) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }
      if (
        target.id === actorParticipant.id ||
        target.role !== ParticipantRole.MEMBER ||
        !isActiveParticipant(target)
      ) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const changedParticipant = await participants.save({
        ...target,
        status: ParticipantStatus.REMOVED,
        tokenRevokedAt: new Date(),
        updatedAt: new Date(),
      });
      await markLatestScoreResultStale(repositories, room);
      const changedRoom =
        room.status === RoomStatus.CALCULATED
          ? await rooms.save({
              ...room,
              status: RoomStatus.OPEN,
              updatedAt: new Date(),
            })
          : room;

      return { participant: changedParticipant, room: changedRoom };
    });

    return {
      participant: changed.participant,
      roomStatus: changed.room.status,
    };
  }
}

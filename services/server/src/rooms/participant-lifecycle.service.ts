import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Room, RoomStatus } from './entities/room.entity';
import {
  createRequestId,
  toPublicParticipant,
  type ParticipantLifecycleResponse,
} from './room-response';
import { getAuthorizedParticipant } from './room-access';
import { markLatestScoreResultStale } from './room-score-state';

@Injectable()
export class ParticipantLifecycleService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async leaveRoom(
    roomId: string,
    accessToken: string | undefined
  ): Promise<ParticipantLifecycleResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    const changed = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const participant = await participantRepository.findOneBy({
          id: actor.participant.id,
        });
        if (!participant || participant.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        this.assertRoomEditable(room);
        if (participant.role !== ParticipantRole.MEMBER) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }
        this.assertActiveParticipant(participant);

        participant.status = ParticipantStatus.LEFT;
        participant.tokenRevokedAt = new Date();
        await participantRepository.save(participant);
        await markLatestScoreResultStale(manager, room);

        if (room.status === RoomStatus.CALCULATED) {
          room.status = RoomStatus.OPEN;
        }
        await roomRepository.save(room);

        return { participant, room };
      }
    );

    return {
      requestId: createRequestId(),
      participant: toPublicParticipant(changed.participant),
      roomStatus: changed.room.status,
    };
  }

  async kickParticipant(
    roomId: string,
    targetParticipantId: string,
    accessToken: string | undefined
  ): Promise<ParticipantLifecycleResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const changed = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const actorParticipant = await participantRepository.findOneBy({
          id: actor.participant.id,
        });
        if (!actorParticipant || actorParticipant.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        if (
          actorParticipant.role !== ParticipantRole.HOST ||
          room.hostParticipantId !== actorParticipant.id
        ) {
          throw new ForbiddenException('HOST_ONLY');
        }
        this.assertActiveParticipant(actorParticipant);

        const target = await participantRepository.findOneBy({
          id: targetParticipantId,
        });
        if (!target || target.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        this.assertRoomEditable(room);
        if (target.id === actorParticipant.id) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }
        if (target.role !== ParticipantRole.MEMBER) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }
        this.assertActiveParticipant(target);

        target.status = ParticipantStatus.REMOVED;
        target.tokenRevokedAt = new Date();
        await participantRepository.save(target);
        await markLatestScoreResultStale(manager, room);

        if (room.status === RoomStatus.CALCULATED) {
          room.status = RoomStatus.OPEN;
        }
        await roomRepository.save(room);

        return { participant: target, room };
      }
    );

    return {
      requestId: createRequestId(),
      participant: toPublicParticipant(changed.participant),
      roomStatus: changed.room.status,
    };
  }

  private assertRoomEditable(room: Room): void {
    if (
      room.status === RoomStatus.CALCULATING ||
      room.status === RoomStatus.CONFIRMED ||
      room.status === RoomStatus.CLOSED
    ) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }
  }

  private assertActiveParticipant(participant: Participant): void {
    if (
      participant.status !== ParticipantStatus.JOINED &&
      participant.status !== ParticipantStatus.RESPONDED
    ) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }
  }
}

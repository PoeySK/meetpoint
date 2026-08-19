import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DecisionStatus } from '../../domain/decision/decision';
import { ParticipantRole } from '../../domain/participant/participant';
import { RoomStatus } from '../../domain/room/room-status';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { validateReopenDecisionInput } from './decision-input-validation';

@Injectable()
export class ReopenDecisionUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    accessToken: string | undefined,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const reason = validateReopenDecisionInput(input);
    const reopened = await this.persistence.transaction(
      async (repositories) => {
        const { rooms, participants, decisions } = repositories;
        const room = await rooms.findById(roomId, { lock: true });
        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const currentParticipant = await participants.findById(
          actor.participant.id
        );
        if (
          !currentParticipant ||
          currentParticipant.roomId !== room.id ||
          currentParticipant.role !== ParticipantRole.HOST ||
          currentParticipant.id !== room.hostParticipantId
        ) {
          throw new ForbiddenException('HOST_ONLY');
        }

        if (room.status !== RoomStatus.CONFIRMED || !room.currentDecisionId) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const decision = await decisions.findById(
          room.currentDecisionId,
          room.id
        );
        if (!decision || decision.status !== DecisionStatus.CONFIRMED) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const now = new Date();
        const savedDecision = await decisions.save({
          ...decision,
          status: DecisionStatus.REOPENED,
          reopenedAt: now,
          reopenReason: reason,
          updatedAt: now,
        });
        await rooms.save({ ...room, status: RoomStatus.OPEN, updatedAt: now });
        return savedDecision;
      }
    );

    return {
      requestId: `req_${randomUUID()}`,
      decision: reopened,
      roomStatus: RoomStatus.OPEN,
    };
  }
}

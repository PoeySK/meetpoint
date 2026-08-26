import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { isRoomEditable } from '../../domain/room/room-state';
import { RoomStatus } from '../../domain/room/room-status';
import { ParticipantStatus } from '../../domain/participant/participant';
import { markLatestScoreResultStale } from '../room-score-state';
import {
  validateParticipantConditionInput,
  type NormalizedParticipantConditionInput,
} from './input-validation';
import { resolveParticipantStatus } from './participant-status';
import type { ParticipantConditionRecord } from '../../domain/participant-condition/participant-condition';

@Injectable()
export class UpsertParticipantConditionUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    participantId: string,
    accessToken: string | undefined,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.id !== participantId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedInput = validateParticipantConditionInput(input);
    const saved = await this.persistence.transaction(async (repositories) => {
      const { rooms, participants, candidates, responses, conditions } =
        repositories;
      const room = await rooms.findById(roomId, { lock: true });
      if (!room) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (!isRoomEditable(room)) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const participant = await participants.findById(participantId);
      if (
        !participant ||
        participant.roomId !== room.id ||
        (participant.status !== ParticipantStatus.JOINED &&
          participant.status !== ParticipantStatus.RESPONDED)
      ) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }

      const existing = await conditions.findByParticipantId(
        room.id,
        participant.id
      );
      const now = new Date();
      const conditionChanged =
        !existing ||
        JSON.stringify(existing.availabilityWindows) !==
          JSON.stringify(normalizedInput.availabilityWindows) ||
        existing.maxBudgetKrw !== normalizedInput.maxBudgetKrw ||
        JSON.stringify(existing.preferences) !==
          JSON.stringify(normalizedInput.preferences);
      const condition: ParticipantConditionRecord = existing ?? {
        participantId: participant.id,
        roomId: room.id,
        availabilityWindows: normalizedInput.availabilityWindows,
        maxBudgetKrw: normalizedInput.maxBudgetKrw,
        preferences: normalizedInput.preferences,
        submittedAt: now,
        updatedAt: now,
      };
      if (conditionChanged) {
        this.applyInput(condition, normalizedInput, now);
      }

      if (conditionChanged) {
        await markLatestScoreResultStale(repositories, room);
        if (room.status === RoomStatus.CALCULATED) {
          await rooms.save({
            ...room,
            status: RoomStatus.OPEN,
            updatedAt: now,
          });
        }
      }

      const activeCandidates = await candidates.findByRoomId(room.id, {
        activeOnly: true,
      });
      const roomResponses = await responses.findByRoomId(room.id);
      const participantStatus = resolveParticipantStatus(
        condition,
        activeCandidates,
        roomResponses
      );
      const savedCondition = conditionChanged
        ? await conditions.save(condition)
        : condition;
      if (participant.status !== participantStatus) {
        await participants.save({
          ...participant,
          status: participantStatus,
          updatedAt: now,
        });
      }

      return { condition: savedCondition, participantStatus };
    });

    return { ...saved, scoreResultStatus: 'STALE' as const };
  }

  private applyInput(
    condition: ParticipantConditionRecord,
    input: NormalizedParticipantConditionInput,
    now: Date
  ): void {
    condition.availabilityWindows = input.availabilityWindows.map((window) => ({
      ...window,
    }));
    condition.maxBudgetKrw = input.maxBudgetKrw;
    condition.preferences = {
      requiredTags: [...input.preferences.requiredTags],
      preferredTags: [...input.preferences.preferredTags],
      avoidTags: [...input.preferences.avoidTags],
    };
    condition.updatedAt = now;
  }
}

import type { CandidateRecord } from '../../domain/candidate/candidate';
import { isActiveParticipant } from '../../domain/participant/participant';
import { RoomStatus, type RoomRecord } from '../../domain/room/room-status';
import type { RoomsRepositories } from '../ports/rooms-persistence.port';
import { resolveParticipantStatus } from './participant-status';

export async function reconcileParticipantStatusesAfterCandidateChange(
  repositories: RoomsRepositories,
  roomId: string,
  activeCandidates: CandidateRecord[],
  now: Date
): Promise<void> {
  const activeParticipants = (
    await repositories.participants.findByRoomId(roomId)
  ).filter(isActiveParticipant);
  const conditions = await repositories.conditions.findByRoomId(roomId);
  const conditionByParticipantId = new Map(
    conditions.map((condition) => [condition.participantId, condition])
  );
  const responses = await repositories.responses.findByRoomId(roomId);

  for (const participant of activeParticipants) {
    const nextStatus = resolveParticipantStatus(
      conditionByParticipantId.get(participant.id) ?? null,
      activeCandidates,
      responses
    );
    if (participant.status === nextStatus) {
      continue;
    }

    await repositories.participants.save({
      ...participant,
      status: nextStatus,
      updatedAt: now,
    });
  }
}

export function reopenRoomAfterCandidateChange(
  room: RoomRecord,
  now: Date
): RoomRecord {
  return {
    ...room,
    status:
      room.status === RoomStatus.DRAFT || room.status === RoomStatus.CALCULATED
        ? RoomStatus.OPEN
        : room.status,
    updatedAt: now,
  };
}

import { Candidate } from '../entities/candidate.entity';
import { Decision } from '../entities/decision.entity';
import { Participant } from '../entities/participant.entity';
import { ParticipantResponse } from '../entities/participant-response.entity';
import { Room } from '../entities/room.entity';
import { ScoreResult } from '../entities/score-result.entity';
import type { CandidateRecord } from '../../../../domain/candidate/candidate';
import type { DecisionRecord } from '../../../../domain/decision/decision';
import type { ParticipantRecord } from '../../../../domain/participant/participant';
import type { ParticipantResponseRecord } from '../../../../domain/participant-response/participant-response';
import type { RoomRecord } from '../../../../domain/room/room-status';
import type { ScoreResultRecord } from '../../../../domain/calculation/score-result';

export function toRoomRecord(entity: Room): RoomRecord {
  return {
    id: entity.id,
    roomCode: entity.roomCode,
    title: entity.title,
    timezone: entity.timezone,
    status: entity.status,
    hostParticipantId: entity.hostParticipantId,
    maxParticipants: entity.maxParticipants,
    latestScoreResultId: entity.latestScoreResultId,
    currentDecisionId: entity.currentDecisionId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toRoomEntity(record: RoomRecord): Room {
  return Object.assign(new Room(), record);
}

export function toParticipantRecord(entity: Participant): ParticipantRecord {
  return {
    id: entity.id,
    roomId: entity.roomId,
    displayName: entity.displayName,
    role: entity.role,
    status: entity.status,
    tokenHash: entity.tokenHash,
    tokenExpiresAt: entity.tokenExpiresAt,
    tokenRevokedAt: entity.tokenRevokedAt,
    joinedAt: entity.joinedAt,
    updatedAt: entity.updatedAt,
  };
}

export function toParticipantEntity(record: ParticipantRecord): Participant {
  return Object.assign(new Participant(), record);
}

export function toCandidateRecord(entity: Candidate): CandidateRecord {
  return {
    id: entity.id,
    roomId: entity.roomId,
    displayOrder: entity.displayOrder,
    time: entity.time,
    place: entity.place,
    estimatedCostPerPersonKrw: entity.estimatedCostPerPersonKrw,
    tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
    status: entity.status,
    version: entity.version,
    archivedAt: entity.archivedAt,
    createdByParticipantId: entity.createdByParticipantId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toCandidateEntity(record: CandidateRecord): Candidate {
  return Object.assign(new Candidate(), {
    ...record,
    tags: [...record.tags],
  });
}

export function toParticipantResponseRecord(
  entity: ParticipantResponse
): ParticipantResponseRecord {
  return {
    id: entity.id,
    roomId: entity.roomId,
    participantId: entity.participantId,
    candidateId: entity.candidateId,
    availabilityStatus: entity.availabilityStatus,
    travelBurden: entity.travelBurden,
    note: entity.note,
    status: entity.status,
    submittedAt: entity.submittedAt,
    updatedAt: entity.updatedAt,
  };
}

export function toParticipantResponseEntity(
  record: ParticipantResponseRecord
): ParticipantResponse {
  return Object.assign(new ParticipantResponse(), record);
}

export function toScoreResultRecord(entity: ScoreResult): ScoreResultRecord {
  return {
    id: entity.id,
    roomId: entity.roomId,
    clientRequestId: entity.clientRequestId,
    status: entity.status,
    policyVersion: entity.policyVersion,
    scoringProfile: entity.scoringProfile,
    inputSnapshotHash: entity.inputSnapshotHash,
    participantCount: entity.participantCount,
    candidateCount: entity.candidateCount,
    coverage: entity.coverage,
    recommendationStatus: entity.recommendationStatus,
    recommendationWarnings: Array.isArray(entity.recommendationWarnings)
      ? [...entity.recommendationWarnings]
      : [],
    ranking: Array.isArray(entity.ranking) ? [...entity.ranking] : [],
    candidates: entity.candidates ?? [],
    metadata: entity.metadata ?? {
      scoringProfile: entity.scoringProfile,
      weights: { time: 0, travelBurden: 0, budget: 0, preference: 0 },
    },
    error: entity.error ?? null,
    createdAt: entity.createdAt,
    completedAt: entity.completedAt,
  };
}

export function toScoreResultEntity(record: ScoreResultRecord): ScoreResult {
  return Object.assign(new ScoreResult(), {
    ...record,
    recommendationWarnings: [...record.recommendationWarnings],
    ranking: [...record.ranking],
  });
}

export function toDecisionRecord(entity: Decision): DecisionRecord {
  return {
    id: entity.id,
    roomId: entity.roomId,
    candidateId: entity.candidateId,
    scoreResultId: entity.scoreResultId,
    decidedByParticipantId: entity.decidedByParticipantId,
    status: entity.status,
    acknowledgeIssues: entity.acknowledgeIssues,
    decisionNote: entity.decisionNote,
    confirmedAt: entity.confirmedAt,
    replacedDecisionId: entity.replacedDecisionId,
    reopenedAt: entity.reopenedAt,
    reopenReason: entity.reopenReason,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toDecisionEntity(record: DecisionRecord): Decision {
  return Object.assign(new Decision(), record);
}

import { randomUUID } from 'node:crypto';
import type { CandidateRecord } from '../../../domain/candidate/candidate';
import type { ParticipantRecord } from '../../../domain/participant/participant';
import {
  type ParticipantResponseRecord,
  ParticipantResponseStatus,
  type AvailabilityStatus,
  type TravelBurden,
} from '../../../domain/participant-response/participant-response';
import { type RoomRecord, RoomStatus } from '../../../domain/room/room-status';
import {
  type ScoreResultRecord,
  type ScoreResultError,
  type ScoreResultMetadata,
  ScoreResultStatus,
  type ScoreResultCoverage,
  type ScoreResultCandidate,
} from '../../../domain/calculation/score-result';
import { toCandidatePayload, type CandidatePayload } from './room-payload';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../../domain/participant/participant';

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
  currentParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: CandidatePayload[];
  myResponses: ParticipantResponsePayload[];
  latestScoreResult: null;
  decision: null;
}

export interface CreatedCandidateResponse {
  requestId: string;
  candidate: CandidatePayload;
}

export interface ParticipantResponsePayload {
  id: string;
  participantId: string;
  candidateId: string;
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
  status: ParticipantResponseStatus;
  submittedAt: Date;
  updatedAt: Date;
}

export interface UpsertedParticipantResponse {
  requestId: string;
  response: ParticipantResponsePayload;
  participantStatus: ParticipantStatus;
  scoreResultStatus: 'STALE';
}

export interface ParticipantLifecycleResponse {
  requestId: string;
  participant: PublicParticipant;
  roomStatus: RoomStatus;
}

export interface CalculationSummary {
  id: string;
  roomId: string;
  status: ScoreResultStatus;
  policyVersion: string;
  scoringProfile: string;
  createdAt: Date;
}

export interface CalculationPayload extends CalculationSummary {
  inputSnapshotHash: string;
  participantCount: number;
  candidateCount: number;
  metadata: ScoreResultMetadata;
  coverage: ScoreResultCoverage;
  recommendationStatus: string | null;
  recommendationWarnings: string[];
  ranking: string[];
  candidates: ScoreResultCandidate[];
  completedAt: Date | null;
  error?: ScoreResultError;
}

export interface StartCalculationResponse {
  requestId: string;
  calculation: CalculationSummary;
  pollUrl: string;
}

export interface CalculationResponse {
  requestId: string;
  calculation: CalculationPayload;
}

export interface LatestScoreResultResponse {
  requestId: string;
  scoreResult: CalculationPayload;
}

export type CreatedRoomResult = {
  room: RoomRecord;
  participant: ParticipantRecord;
  hostToken: string;
  inviteUrl: string;
};

export type JoinedParticipantResult = {
  room: RoomRecord;
  participant: ParticipantRecord;
  participantToken: string;
};

export type RoomDetailsResult = {
  room: RoomRecord;
  hostParticipant: ParticipantRecord;
  currentParticipant: ParticipantRecord;
  participants: ParticipantRecord[];
  candidates: CandidateRecord[];
  myResponses: ParticipantResponseRecord[];
};

export type CreatedCandidateResult = {
  candidate: CandidateRecord;
};

export type UpsertedParticipantResponseResult = {
  response: ParticipantResponseRecord;
  participantStatus: ParticipantStatus;
  scoreResultStatus: 'STALE';
};

export type ParticipantLifecycleResult = {
  participant: ParticipantRecord;
  roomStatus: RoomStatus;
};

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

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function toRoomPayload(room: RoomRecord): RoomPayload {
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

export function toPublicParticipant(
  participant: ParticipantRecord
): PublicParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName,
    role: participant.role,
    status: participant.status,
  };
}

export function toParticipantResponsePayload(
  response: ParticipantResponseRecord
): ParticipantResponsePayload {
  return {
    id: response.id,
    participantId: response.participantId,
    candidateId: response.candidateId,
    availabilityStatus: response.availabilityStatus,
    travelBurden: response.travelBurden,
    note: response.note,
    status: response.status,
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
  };
}

export function toCalculationSummary(
  scoreResult: ScoreResultRecord
): CalculationSummary {
  return {
    id: scoreResult.id,
    roomId: scoreResult.roomId,
    status: scoreResult.status,
    policyVersion: scoreResult.policyVersion,
    scoringProfile: scoreResult.scoringProfile,
    createdAt: scoreResult.createdAt,
  };
}

export function toCalculationPayload(
  scoreResult: ScoreResultRecord
): CalculationPayload {
  const payload: CalculationPayload = {
    ...toCalculationSummary(scoreResult),
    inputSnapshotHash: scoreResult.inputSnapshotHash,
    participantCount: scoreResult.participantCount,
    candidateCount: scoreResult.candidateCount,
    metadata: scoreResult.metadata,
    coverage: scoreResult.coverage,
    recommendationStatus: scoreResult.recommendationStatus,
    recommendationWarnings: scoreResult.recommendationWarnings,
    ranking: scoreResult.ranking,
    candidates: scoreResult.candidates,
    completedAt: scoreResult.completedAt,
  };

  if (scoreResult.error) {
    payload.error = scoreResult.error;
  }

  return payload;
}

export function toCreatedRoomResponse(
  result: CreatedRoomResult
): CreatedRoomResponse {
  return {
    requestId: createRequestId(),
    room: toRoomPayload(result.room),
    hostParticipant: toPublicParticipant(result.participant),
    access: {
      hostToken: result.hostToken,
      inviteUrl: result.inviteUrl,
    },
  };
}

export function toJoinedParticipantResponse(
  result: JoinedParticipantResult
): JoinedParticipantResponse {
  return {
    requestId: createRequestId(),
    room: {
      id: result.room.id,
      roomCode: result.room.roomCode,
      status: result.room.status,
    },
    participant: toPublicParticipant(result.participant),
    access: {
      participantToken: result.participantToken,
    },
  };
}

export function toRoomDetailsResponse(
  result: RoomDetailsResult
): RoomDetailsResponse {
  return {
    requestId: createRequestId(),
    room: toRoomPayload(result.room),
    hostParticipant: toPublicParticipant(result.hostParticipant),
    currentParticipant: toPublicParticipant(result.currentParticipant),
    participants: result.participants.map(toPublicParticipant),
    candidates: result.candidates.map(toCandidatePayload),
    myResponses: result.myResponses.map(toParticipantResponsePayload),
    latestScoreResult: null,
    decision: null,
  };
}

export function toCreatedCandidateResponse(
  result: CreatedCandidateResult
): CreatedCandidateResponse {
  return {
    requestId: createRequestId(),
    candidate: toCandidatePayload(result.candidate),
  };
}

export function toUpsertedParticipantResponse(
  result: UpsertedParticipantResponseResult
): UpsertedParticipantResponse {
  return {
    requestId: createRequestId(),
    response: toParticipantResponsePayload(result.response),
    participantStatus: result.participantStatus,
    scoreResultStatus: result.scoreResultStatus,
  };
}

export function toParticipantLifecycleResponse(
  result: ParticipantLifecycleResult
): ParticipantLifecycleResponse {
  return {
    requestId: createRequestId(),
    participant: toPublicParticipant(result.participant),
    roomStatus: result.roomStatus,
  };
}

export function toStartCalculationResponse(result: {
  requestId: string;
  scoreResult: ScoreResultRecord;
}): StartCalculationResponse {
  return {
    requestId: result.requestId,
    calculation: toCalculationSummary(result.scoreResult),
    pollUrl: `/api/v1/rooms/${encodeURIComponent(result.scoreResult.roomId)}/calculations/${encodeURIComponent(result.scoreResult.id)}`,
  };
}

export function toCalculationResponse(
  scoreResult: ScoreResultRecord
): CalculationResponse {
  return {
    requestId: createRequestId(),
    calculation: toCalculationPayload(scoreResult),
  };
}

export function toLatestScoreResultResponse(
  scoreResult: ScoreResultRecord
): LatestScoreResultResponse {
  return {
    requestId: createRequestId(),
    scoreResult: toCalculationPayload(scoreResult),
  };
}

import { randomUUID } from 'node:crypto';
import type { Participant } from '../participants/entities/participant.entity';
import {
  ParticipantResponse,
  ParticipantResponseStatus,
} from './entities/participant-response.entity';
import { Room, RoomStatus } from './entities/room.entity';
import {
  ScoreResult,
  ScoreResultError,
  ScoreResultMetadata,
  ScoreResultStatus,
  ScoreResultCoverage,
  ScoreResultCandidate,
} from './entities/score-result.entity';
import type { CandidatePayload } from './room-payload';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import {
  CALCULATION_SCORING_PROFILE,
  CALCULATION_WEIGHTS,
} from './calculation/calculation-policy';
import {
  AvailabilityStatus,
  TravelBurden,
} from './entities/participant-response.entity';

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

export function createScoringMetadata(): ScoreResultMetadata {
  return {
    scoringProfile: CALCULATION_SCORING_PROFILE,
    weights: { ...CALCULATION_WEIGHTS },
  };
}

export function toRoomPayload(room: Room): RoomPayload {
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
  participant: Participant
): PublicParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName,
    role: participant.role,
    status: participant.status,
  };
}

export function toParticipantResponsePayload(
  response: ParticipantResponse
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
  scoreResult: ScoreResult
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
  scoreResult: ScoreResult
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

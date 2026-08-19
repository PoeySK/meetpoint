import { randomUUID } from 'node:crypto';
import type { CandidateRecord } from '../../../domain/candidate/candidate';
import {
  DecisionStatus,
  type DecisionRecord,
} from '../../../domain/decision/decision';
import { RoomStatus } from '../../../domain/room/room-status';
import { toCandidatePayload, type CandidatePayload } from './room-payload';

export interface DecisionPayload {
  id: string;
  roomId: string;
  candidateId: string;
  scoreResultId: string;
  decidedByParticipantId: string;
  status: DecisionStatus;
  acknowledgeIssues: boolean;
  decisionNote: string | null;
  confirmedAt: Date;
  replacedDecisionId: string | null;
  reopenedAt: Date | null;
  reopenReason: string | null;
}

export interface DecisionProjection extends DecisionPayload {
  candidate: CandidatePayload;
  overallScore: number;
}

export interface CreateDecisionResponse {
  requestId: string;
  decision: DecisionPayload;
  roomStatus: RoomStatus.CONFIRMED;
}

export interface ReopenDecisionResponse {
  requestId: string;
  decision: DecisionPayload;
  roomStatus: RoomStatus.OPEN;
  nextStep: 'CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE';
}

export interface DecisionResponse {
  requestId: string;
  decision: DecisionProjection;
}

export function toDecisionPayload(decision: DecisionRecord): DecisionPayload {
  return {
    id: decision.id,
    roomId: decision.roomId,
    candidateId: decision.candidateId,
    scoreResultId: decision.scoreResultId,
    decidedByParticipantId: decision.decidedByParticipantId,
    status: decision.status,
    acknowledgeIssues: decision.acknowledgeIssues,
    decisionNote: decision.decisionNote,
    confirmedAt: decision.confirmedAt,
    replacedDecisionId: decision.replacedDecisionId,
    reopenedAt: decision.reopenedAt,
    reopenReason: decision.reopenReason,
  };
}

export function toDecisionProjection(
  decision: DecisionRecord,
  candidate: CandidateRecord,
  overallScore: number
): DecisionProjection {
  return {
    ...toDecisionPayload(decision),
    candidate: toCandidatePayload(candidate),
    overallScore,
  };
}

export function toCreateDecisionResponse(result: {
  requestId: string;
  decision: DecisionRecord;
  roomStatus: RoomStatus.CONFIRMED;
}): CreateDecisionResponse {
  return {
    requestId: result.requestId,
    decision: toDecisionPayload(result.decision),
    roomStatus: result.roomStatus,
  };
}

export function toReopenDecisionResponse(result: {
  requestId: string;
  decision: DecisionRecord;
  roomStatus: RoomStatus.OPEN;
}): ReopenDecisionResponse {
  return {
    requestId: result.requestId,
    decision: toDecisionPayload(result.decision),
    roomStatus: result.roomStatus,
    nextStep: 'CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE',
  };
}

export function toDecisionResponse(result: {
  decision: DecisionRecord;
  candidate: CandidateRecord;
  overallScore: number;
}): DecisionResponse {
  return {
    requestId: `req_${randomUUID()}`,
    decision: toDecisionProjection(
      result.decision,
      result.candidate,
      result.overallScore
    ),
  };
}

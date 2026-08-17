import type { Candidate } from "@/entities/candidate/model/types";

export type DecisionStatus = "CONFIRMED" | "REOPENED" | "SUPERSEDED";

export type DecisionRecord = {
  id: string;
  roomId: string;
  candidateId: string;
  scoreResultId: string;
  decidedByParticipantId: string;
  status: DecisionStatus;
  acknowledgeIssues: boolean;
  decisionNote: string | null;
  confirmedAt: string;
  replacedDecisionId: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

export type DecisionPayload = DecisionRecord & {
  candidate: Candidate;
  overallScore: number;
};

export type DecisionResponse = {
  requestId: string;
  decision: DecisionPayload;
};

export type CreateDecisionInput = {
  candidateId: string;
  scoreResultId: string;
  acknowledgeIssues: boolean;
  decisionNote?: string | null;
};

export type CreateDecisionResponse = {
  requestId: string;
  decision: DecisionRecord;
  roomStatus: "CONFIRMED";
};

export type ReopenDecisionInput = {
  reason: string;
};

export type ReopenDecisionResponse = {
  requestId: string;
  decision: DecisionRecord;
  roomStatus: "OPEN";
  nextStep: "CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE";
};

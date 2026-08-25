export enum DecisionStatus {
  CONFIRMED = 'CONFIRMED',
  REOPENED = 'REOPENED',
  SUPERSEDED = 'SUPERSEDED',
}

export interface DecisionRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

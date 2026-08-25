export enum ScoreResultStatus {
  REQUESTED = 'REQUESTED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STALE = 'STALE',
}

export interface ScoreResultCoverage {
  respondedParticipants: number;
  totalParticipants: number;
  submittedResponses: number;
  expectedResponses: number;
}

export interface ScoreResultMetadata {
  scoringProfile: string;
  weights: {
    time: number;
    travelBurden: number;
    budget: number;
    preference: number;
  };
}

export interface ScoreResultCandidate {
  candidateId: string;
  rank: number;
  overallScore: number;
  eligible: boolean;
  matchLevel: string;
  hardConflictCount: number;
  coverage: {
    submittedResponses: number;
    expectedResponses: number;
  };
  participantBreakdown: Array<{
    participantId: string;
    score: number;
    components: {
      time: number;
      travelBurden: number;
      budget: number;
      preference: number;
    };
    hardConflicts: string[];
    blockingIssues: string[];
    reasons: string[];
  }>;
  reasons: string[];
  conflicts: Array<{ participantId: string; code: string }>;
  blockingIssues: string[];
  explanationFlags: string[];
}

export interface ScoreResultError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface ScoreResultRecord {
  id: string;
  roomId: string;
  clientRequestId: string;
  status: ScoreResultStatus;
  policyVersion: string;
  scoringProfile: string;
  inputSnapshotHash: string;
  participantCount: number;
  candidateCount: number;
  coverage: ScoreResultCoverage;
  recommendationStatus: string | null;
  recommendationWarnings: string[];
  ranking: string[];
  candidates: ScoreResultCandidate[];
  metadata: ScoreResultMetadata;
  error: ScoreResultError | null;
  createdAt: Date;
  completedAt: Date | null;
}

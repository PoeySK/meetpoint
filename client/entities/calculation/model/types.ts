export type ScoreResultStatus =
  | "REQUESTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "STALE";
export type MatchLevel = "FULL" | "PARTIAL" | "CONFLICTED" | "INCOMPLETE";
export type RecommendationStatus =
  | "INCOMPLETE"
  | "FULL_MATCH"
  | "PARTIAL_MATCH"
  | "NO_FULL_MATCH";
export type ScoringProfile = "MVP_NO_CONDITIONS";

export type ScoreResultMetadata = {
  scoringProfile: ScoringProfile;
  weights: {
    time: number;
    travelBurden: number;
    budget: number;
    preference: number;
  };
};

export type ScoreResultCandidate = {
  candidateId: string;
  rank: number;
  overallScore: number;
  eligible: boolean;
  matchLevel: MatchLevel;
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
};

export type CalculationPayload = {
  id: string;
  roomId: string;
  status: ScoreResultStatus;
  policyVersion: string;
  scoringProfile: ScoringProfile;
  inputSnapshotHash: string;
  participantCount: number;
  candidateCount: number;
  metadata: ScoreResultMetadata;
  coverage: {
    respondedParticipants: number;
    totalParticipants: number;
    submittedResponses: number;
    expectedResponses: number;
  };
  recommendationStatus: RecommendationStatus | null;
  recommendationWarnings: string[];
  ranking: string[];
  candidates: ScoreResultCandidate[];
  createdAt: string;
  completedAt: string | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

export type StartCalculationResponse = {
  requestId: string;
  calculation: Pick<
    CalculationPayload,
    "id" | "roomId" | "status" | "policyVersion" | "scoringProfile" | "createdAt"
  >;
  pollUrl: string;
};

export type CalculationResponse = {
  requestId: string;
  calculation: CalculationPayload;
};

export type LatestScoreResultResponse = {
  requestId: string;
  scoreResult: CalculationPayload;
};

import type {
  AvailabilityStatus,
  ParticipantResponse,
  TravelBurden,
} from '../entities/participant-response.entity';
import type {
  CandidatePlace,
  CandidateTime,
} from '../entities/candidate.entity';
import type {
  ScoreResultCandidate,
  ScoreResultCoverage,
  ScoreResultMetadata,
} from '../entities/score-result.entity';

export interface SolverSnapshot {
  requestId: string;
  policyVersion: string;
  scoringProfile: string;
  roomId: string;
  participants: Array<{
    participantId: string;
    responses: Array<{
      candidateId: string;
      availabilityStatus: AvailabilityStatus;
      travelBurden: TravelBurden;
      note: string | null;
    }>;
  }>;
  candidates: Array<{
    candidateId: string;
    displayOrder: number;
    time: CandidateTime;
    place: CandidatePlace;
    estimatedCostPerPersonKrw: number;
    tags: string[];
  }>;
}

export interface SolverResponsePayload {
  requestId: string;
  policyVersion: string;
  scoringProfile: string;
  status: 'COMPLETED';
  metadata: ScoreResultMetadata;
  recommendationStatus: string;
  recommendationWarnings: string[];
  coverage: ScoreResultCoverage;
  ranking: string[];
  candidates: ScoreResultCandidate[];
}

export class SolverCallError extends Error {
  constructor(
    public readonly code: 'SOLVER_ERROR' | 'SOLVER_UNAVAILABLE',
    message: string,
    public readonly retryable: boolean,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'SolverCallError';
  }
}

export function isCandidateResponseForSnapshot(
  response: ParticipantResponse,
  participantId: string,
  candidateIds: ReadonlySet<string>
): boolean {
  return (
    response.participantId === participantId &&
    candidateIds.has(response.candidateId)
  );
}

import {
  CALCULATION_SCORING_PROFILE,
  CALCULATION_WEIGHTS,
  LEGACY_CALCULATION_SCORING_PROFILE,
} from '../../domain/calculation/calculation-policy';
import {
  SolverCallError,
  type SolverResponsePayload,
  type SolverSnapshot,
} from '../../application/ports/solver-contract';
import type {
  ScoreResultCandidate,
  ScoreResultCoverage,
  ScoreResultMetadata,
} from '../../domain/calculation/score-result';

const VALID_RECOMMENDATION_STATUSES = new Set([
  'INCOMPLETE',
  'FULL_MATCH',
  'PARTIAL_MATCH',
  'NO_FULL_MATCH',
]);
const VALID_MATCH_LEVELS = new Set([
  'FULL',
  'PARTIAL',
  'CONFLICTED',
  'INCOMPLETE',
]);
const VALID_CONFLICT_CODES = new Set([
  'TIME_UNAVAILABLE',
  'TIME_CONDITION_CONFLICT',
  'TRAVEL_BURDEN_HARD',
  'BUDGET_LIMIT_EXCEEDED',
  'REQUIRED_TAG_MISSING',
  'AVOID_TAG_PRESENT',
]);
const VALID_BLOCKING_ISSUES = new Set(['MISSING_RESPONSE']);
const VALID_EXPLANATION_FLAGS = new Set([
  'MAYBE_RESPONSE',
  'TRAVEL_BURDEN_UNCERTAIN',
  'SELF_REPORTED_TRAVEL_BURDEN',
  'MISSING_RESPONSE',
  'NO_FULL_MATCH',
  'NO_BUDGET_CONSTRAINT',
  'PREFERENCE_UNEVALUATED',
  'CONDITION_NOT_PROVIDED',
]);

export function validateSolverResponse(
  snapshot: SolverSnapshot,
  response: SolverResponsePayload
): void {
  const invalidResponse = (message: string): never => {
    throw new SolverCallError('SOLVER_ERROR', message, false, {});
  };
  const expectedCandidateIds = snapshot.candidates.map(
    (candidate) => candidate.candidateId
  );
  const expectedParticipantIds = new Set(
    snapshot.participants.map((participant) => participant.participantId)
  );
  const actualCandidateIds = response.candidates.map(
    (candidate) => candidate.candidateId
  );
  const expected = [...expectedCandidateIds].sort();
  const actual = [...actualCandidateIds].sort();

  if (
    response.requestId !== snapshot.requestId ||
    response.policyVersion !== snapshot.policyVersion ||
    response.scoringProfile !== snapshot.scoringProfile ||
    response.metadata.scoringProfile !== snapshot.scoringProfile ||
    response.candidates.length !== expectedCandidateIds.length ||
    JSON.stringify(expected) !== JSON.stringify(actual) ||
    JSON.stringify(response.ranking) !== JSON.stringify(actualCandidateIds)
  ) {
    invalidResponse('Solver response does not match the calculation snapshot.');
  }

  if (
    !isValidScoringMetadata(response.metadata, snapshot.scoringProfile) ||
    !VALID_RECOMMENDATION_STATUSES.has(response.recommendationStatus) ||
    response.recommendationWarnings.some((warning) => warning !== 'LOW_SCORE')
  ) {
    invalidResponse('Solver response contains invalid scoring metadata.');
  }

  const expectedResponses =
    snapshot.participants.length * snapshot.candidates.length;
  if (
    response.coverage.totalParticipants !== snapshot.participants.length ||
    response.coverage.expectedResponses !== expectedResponses ||
    !isValidCoverageCount(
      response.coverage.respondedParticipants,
      response.coverage.totalParticipants
    ) ||
    !isValidCoverageCount(
      response.coverage.submittedResponses,
      response.coverage.expectedResponses
    )
  ) {
    invalidResponse('Solver response contains invalid coverage.');
  }

  const submittedResponses = response.candidates.reduce(
    (total, candidate) => total + candidate.coverage.submittedResponses,
    0
  );
  if (submittedResponses !== response.coverage.submittedResponses) {
    invalidResponse(
      'Solver response coverage does not match candidate results.'
    );
  }

  for (const [index, candidate] of response.candidates.entries()) {
    if (
      candidate.rank !== index + 1 ||
      !Number.isFinite(candidate.overallScore) ||
      candidate.overallScore < 0 ||
      candidate.overallScore > 100 ||
      !VALID_MATCH_LEVELS.has(candidate.matchLevel) ||
      !Number.isInteger(candidate.hardConflictCount) ||
      candidate.hardConflictCount < 0 ||
      candidate.coverage.expectedResponses !== snapshot.participants.length ||
      !isValidCoverageCount(
        candidate.coverage.submittedResponses,
        candidate.coverage.expectedResponses
      )
    ) {
      invalidResponse('Solver response contains invalid candidate results.');
    }

    const participantIds = candidate.participantBreakdown.map(
      (participant) => participant.participantId
    );
    if (
      participantIds.length !== expectedParticipantIds.size ||
      new Set(participantIds).size !== expectedParticipantIds.size ||
      participantIds.some(
        (participantId) => !expectedParticipantIds.has(participantId)
      )
    ) {
      invalidResponse(
        'Solver response participant breakdown does not match the calculation snapshot.'
      );
    }

    if (
      candidate.conflicts.some(
        (conflict) =>
          !expectedParticipantIds.has(conflict.participantId) ||
          !VALID_CONFLICT_CODES.has(conflict.code)
      ) ||
      candidate.blockingIssues.some(
        (issue) => !VALID_BLOCKING_ISSUES.has(issue)
      ) ||
      candidate.explanationFlags.some(
        (flag) => !VALID_EXPLANATION_FLAGS.has(flag)
      ) ||
      candidate.hardConflictCount !== candidate.conflicts.length
    ) {
      invalidResponse(
        'Solver response contains invalid candidate explanations.'
      );
    }

    for (const participant of candidate.participantBreakdown) {
      const components = participant.components;
      if (
        !Number.isFinite(participant.score) ||
        participant.score < 0 ||
        participant.score > 100 ||
        !Number.isFinite(components.time) ||
        components.time < 0 ||
        components.time > CALCULATION_WEIGHTS.time ||
        !Number.isFinite(components.travelBurden) ||
        components.travelBurden < 0 ||
        components.travelBurden > CALCULATION_WEIGHTS.travelBurden ||
        !Number.isFinite(components.budget) ||
        components.budget < 0 ||
        components.budget > CALCULATION_WEIGHTS.budget ||
        !Number.isFinite(components.preference) ||
        components.preference < 0 ||
        components.preference > CALCULATION_WEIGHTS.preference ||
        participant.hardConflicts.some(
          (conflict) => !VALID_CONFLICT_CODES.has(conflict)
        ) ||
        participant.blockingIssues.some(
          (issue) => !VALID_BLOCKING_ISSUES.has(issue)
        )
      ) {
        invalidResponse('Solver response contains invalid participant scores.');
      }
    }
  }
}

export function isSolverResponsePayload(
  value: unknown
): value is SolverResponsePayload {
  const record = toRecord(value);
  const candidates = Array.isArray(record?.candidates)
    ? record.candidates
    : undefined;

  return Boolean(
    record &&
    typeof record.requestId === 'string' &&
    typeof record.policyVersion === 'string' &&
    typeof record.scoringProfile === 'string' &&
    record.status === 'COMPLETED' &&
    isValidScoringMetadata(record.metadata) &&
    typeof record.recommendationStatus === 'string' &&
    isStringArray(record.recommendationWarnings) &&
    isValidCoverage(record.coverage) &&
    Array.isArray(record.ranking) &&
    record.ranking.every((candidateId) => typeof candidateId === 'string') &&
    candidates !== undefined &&
    candidates.every((candidate) => isValidCandidateResult(candidate))
  );
}

function isValidCandidateResult(value: unknown): value is ScoreResultCandidate {
  const record = toRecord(value);
  const participantBreakdown = Array.isArray(record?.participantBreakdown)
    ? record.participantBreakdown
    : undefined;
  const conflicts = Array.isArray(record?.conflicts)
    ? record.conflicts
    : undefined;

  return Boolean(
    record &&
    typeof record.candidateId === 'string' &&
    typeof record.rank === 'number' &&
    typeof record.overallScore === 'number' &&
    typeof record.eligible === 'boolean' &&
    typeof record.matchLevel === 'string' &&
    typeof record.hardConflictCount === 'number' &&
    isValidCandidateCoverage(record.coverage) &&
    participantBreakdown !== undefined &&
    participantBreakdown.every((participant) =>
      isValidParticipantBreakdown(participant)
    ) &&
    isStringArray(record.reasons) &&
    conflicts !== undefined &&
    conflicts.every((conflict) => {
      const conflictRecord = toRecord(conflict);
      return Boolean(
        conflictRecord &&
        typeof conflictRecord.participantId === 'string' &&
        typeof conflictRecord.code === 'string'
      );
    }) &&
    isStringArray(record.blockingIssues) &&
    isStringArray(record.explanationFlags)
  );
}

function isValidParticipantBreakdown(value: unknown): boolean {
  const record = toRecord(value);
  const components = toRecord(record?.components);

  return Boolean(
    record &&
    typeof record.participantId === 'string' &&
    typeof record.score === 'number' &&
    components &&
    typeof components.time === 'number' &&
    typeof components.travelBurden === 'number' &&
    typeof components.budget === 'number' &&
    typeof components.preference === 'number' &&
    isStringArray(record.hardConflicts) &&
    isStringArray(record.blockingIssues) &&
    isStringArray(record.reasons)
  );
}

function isValidScoringMetadata(
  value: unknown,
  expectedProfile?: string
): value is ScoreResultMetadata {
  const record = toRecord(value);
  const weights = toRecord(record?.weights);

  return Boolean(
    record &&
    (expectedProfile === undefined ||
      record.scoringProfile === expectedProfile) &&
    (record.scoringProfile === CALCULATION_SCORING_PROFILE ||
      record.scoringProfile === LEGACY_CALCULATION_SCORING_PROFILE) &&
    weights &&
    weights.time === CALCULATION_WEIGHTS.time &&
    weights.travelBurden === CALCULATION_WEIGHTS.travelBurden &&
    weights.budget === CALCULATION_WEIGHTS.budget &&
    weights.preference === CALCULATION_WEIGHTS.preference
  );
}

function isValidCoverage(value: unknown): value is ScoreResultCoverage {
  const record = toRecord(value);

  return Boolean(
    record &&
    typeof record.respondedParticipants === 'number' &&
    typeof record.totalParticipants === 'number' &&
    typeof record.submittedResponses === 'number' &&
    typeof record.expectedResponses === 'number'
  );
}

function isValidCandidateCoverage(value: unknown): boolean {
  const record = toRecord(value);

  return Boolean(
    record &&
    typeof record.submittedResponses === 'number' &&
    typeof record.expectedResponses === 'number'
  );
}

function isValidCoverageCount(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

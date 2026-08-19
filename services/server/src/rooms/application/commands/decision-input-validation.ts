import { BadRequestException } from '@nestjs/common';

export type NormalizedCreateDecisionInput = {
  candidateId: string;
  scoreResultId: string;
  acknowledgeIssues: boolean;
  decisionNote: string | null;
};

export function validateCreateDecisionInput(
  input: unknown
): NormalizedCreateDecisionInput {
  const candidate = input as
    | {
        candidateId?: unknown;
        scoreResultId?: unknown;
        acknowledgeIssues?: unknown;
        decisionNote?: unknown;
      }
    | null
    | undefined;
  const candidateId =
    typeof candidate?.candidateId === 'string'
      ? candidate.candidateId.trim()
      : '';
  const scoreResultId =
    typeof candidate?.scoreResultId === 'string'
      ? candidate.scoreResultId.trim()
      : '';

  if (
    !candidateId ||
    !scoreResultId ||
    typeof candidate?.acknowledgeIssues !== 'boolean'
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  if (
    candidate?.decisionNote !== undefined &&
    candidate.decisionNote !== null &&
    typeof candidate.decisionNote !== 'string'
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  const decisionNote =
    typeof candidate.decisionNote === 'string'
      ? candidate.decisionNote.trim()
      : null;
  if (decisionNote && decisionNote.length > 300) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  return {
    candidateId,
    scoreResultId,
    acknowledgeIssues: candidate.acknowledgeIssues,
    decisionNote,
  };
}

export function validateReopenDecisionInput(input: unknown): string {
  const candidate = input as { reason?: unknown } | null | undefined;
  const reason =
    typeof candidate?.reason === 'string' ? candidate.reason.trim() : '';
  if (!reason || reason.length > 300) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
  return reason;
}

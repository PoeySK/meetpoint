import type { ScoreResultError } from './score-result';
import type { SolverSnapshot } from '../../application/ports/solver-contract';

export enum CalculationJobStatus {
  REQUESTED = 'REQUESTED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface CalculationJobRecord {
  id: string;
  roomId: string;
  scoreResultId: string;
  snapshot: SolverSnapshot;
  status: CalculationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lastError: ScoreResultError | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

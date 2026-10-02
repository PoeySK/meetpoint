import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CalculationJobStatus,
  type CalculationJobRecord,
} from '../domain/calculation/calculation-job';
import { ScoreResultStatus } from '../domain/calculation/score-result';
import { RoomStatus } from '../domain/room/room-status';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from './ports/rooms-persistence.port';
import { SOLVER, type SolverPort } from './ports/solver.port';
import {
  SolverCallError,
  type SolverResponsePayload,
} from './ports/solver-contract';

const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

@Injectable()
export class CalculationJobRunner
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private isDraining = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(SOLVER) private readonly solver: SolverPort
  ) {}

  onApplicationBootstrap() {
    this.trigger();
    this.timer = setInterval(
      () => this.trigger(),
      this.readPositiveIntegerEnv(
        'CALCULATION_JOB_POLL_INTERVAL_MS',
        DEFAULT_POLL_INTERVAL_MS
      )
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  trigger() {
    if (!this.isDraining) {
      void this.drain();
    }
  }

  async runOne(): Promise<boolean> {
    const claimed = await this.claimNextJob();
    if (!claimed) {
      return false;
    }

    try {
      const response = await this.solver.solve(claimed.snapshot);
      await this.complete(claimed, response);
    } catch (error) {
      await this.handleFailure(claimed, this.toSolverError(error));
    }
    return true;
  }

  private async drain() {
    this.isDraining = true;
    try {
      while (await this.runOne()) {
        // 작업 처리는 반복 조건의 runOne에서 수행한다.
      }
    } finally {
      this.isDraining = false;
    }
  }

  private async claimNextJob(): Promise<CalculationJobRecord | null> {
    const now = new Date();
    const leaseExpiredBefore = new Date(
      now.getTime() -
        this.readPositiveIntegerEnv(
          'CALCULATION_JOB_LEASE_MS',
          DEFAULT_LEASE_MS
        )
    );
    return this.persistence.transaction(
      async ({ calculationJobs, scoreResults }) => {
        const job = await calculationJobs.claimNextRunnable(
          now,
          leaseExpiredBefore
        );
        if (!job) {
          return null;
        }
        const scoreResult = await scoreResults.findById(job.scoreResultId, {
          lock: true,
        });
        if (
          !scoreResult ||
          scoreResult.status === ScoreResultStatus.COMPLETED ||
          scoreResult.status === ScoreResultStatus.FAILED
        ) {
          await calculationJobs.save({
            ...job,
            status: CalculationJobStatus.FAILED,
            lastError: {
              code: 'CALCULATION_JOB_ORPHANED',
              message: 'Calculation job cannot be applied to its score result.',
              retryable: false,
              details: {},
            },
            completedAt: now,
            updatedAt: now,
          });
          return null;
        }
        await scoreResults.save({
          ...scoreResult,
          status: ScoreResultStatus.RUNNING,
          error: null,
        });
        return job;
      }
    );
  }

  private async complete(
    job: CalculationJobRecord,
    response: SolverResponsePayload
  ) {
    const now = new Date();
    await this.persistence.transaction(
      async ({ calculationJobs, scoreResults, rooms }) => {
        const currentJob = await calculationJobs.findById(job.id, {
          lock: true,
        });
        if (!this.isCurrentClaim(currentJob, job)) {
          return;
        }
        const scoreResult = await scoreResults.findById(job.scoreResultId, {
          lock: true,
        });
        if (!scoreResult) {
          return;
        }
        await scoreResults.save({
          ...scoreResult,
          status: ScoreResultStatus.COMPLETED,
          recommendationStatus: response.recommendationStatus,
          recommendationWarnings: response.recommendationWarnings,
          coverage: response.coverage,
          ranking: response.ranking,
          candidates: response.candidates,
          metadata: response.metadata,
          error: null,
          completedAt: now,
        });
        await calculationJobs.save({
          ...currentJob,
          status: CalculationJobStatus.COMPLETED,
          lockedAt: null,
          lastError: null,
          completedAt: now,
          updatedAt: now,
        });
        const room = await rooms.findById(job.roomId, { lock: true });
        if (
          room &&
          room.status === RoomStatus.CALCULATING &&
          room.latestScoreResultId === job.scoreResultId
        ) {
          await rooms.save({
            ...room,
            status: RoomStatus.CALCULATED,
            updatedAt: now,
          });
        }
      }
    );
  }

  private async handleFailure(
    job: CalculationJobRecord,
    error: SolverCallError
  ) {
    const now = new Date();
    await this.persistence.transaction(
      async ({ calculationJobs, scoreResults, rooms }) => {
        const currentJob = await calculationJobs.findById(job.id, {
          lock: true,
        });
        if (!this.isCurrentClaim(currentJob, job)) {
          return;
        }
        const scoreResult = await scoreResults.findById(job.scoreResultId, {
          lock: true,
        });
        if (!scoreResult) {
          return;
        }
        const failure = {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details,
        };
        const willRetry =
          error.retryable && currentJob.attemptCount < currentJob.maxAttempts;
        if (willRetry) {
          const retryAt = new Date(
            now.getTime() +
              this.readPositiveIntegerEnv(
                'CALCULATION_JOB_RETRY_DELAY_MS',
                DEFAULT_RETRY_DELAY_MS
              )
          );
          await calculationJobs.save({
            ...currentJob,
            status: CalculationJobStatus.REQUESTED,
            lockedAt: null,
            nextAttemptAt: retryAt,
            lastError: failure,
            updatedAt: now,
          });
          await scoreResults.save({
            ...scoreResult,
            status: ScoreResultStatus.REQUESTED,
            error: failure,
          });
          return;
        }

        await calculationJobs.save({
          ...currentJob,
          status: CalculationJobStatus.FAILED,
          lockedAt: null,
          lastError: failure,
          completedAt: now,
          updatedAt: now,
        });
        await scoreResults.save({
          ...scoreResult,
          status: ScoreResultStatus.FAILED,
          error: failure,
          completedAt: now,
        });
        const room = await rooms.findById(job.roomId, { lock: true });
        if (
          room &&
          room.status === RoomStatus.CALCULATING &&
          room.latestScoreResultId === job.scoreResultId
        ) {
          await rooms.save({
            ...room,
            status: RoomStatus.OPEN,
            updatedAt: now,
          });
        }
      }
    );
  }

  private isCurrentClaim(
    currentJob: CalculationJobRecord | null,
    claimedJob: CalculationJobRecord
  ): currentJob is CalculationJobRecord {
    return (
      currentJob?.status === CalculationJobStatus.RUNNING &&
      currentJob.lockedAt?.getTime() === claimedJob.lockedAt?.getTime()
    );
  }

  private toSolverError(error: unknown): SolverCallError {
    return error instanceof SolverCallError
      ? error
      : new SolverCallError(
          'SOLVER_ERROR',
          'Solver returned an invalid response.',
          false,
          {}
        );
  }

  private readPositiveIntegerEnv(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}

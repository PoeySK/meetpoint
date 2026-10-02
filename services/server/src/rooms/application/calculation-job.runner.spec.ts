import { Logger } from '@nestjs/common';
import { CalculationJobRunner } from './calculation-job.runner';
import {
  CalculationJobStatus,
  type CalculationJobRecord,
} from '../domain/calculation/calculation-job';
import {
  ScoreResultStatus,
  type ScoreResultRecord,
} from '../domain/calculation/score-result';
import { RoomStatus } from '../domain/room/room-status';
import type {
  RoomsPersistencePort,
  RoomsRepositories,
} from './ports/rooms-persistence.port';
import type { SolverPort } from './ports/solver.port';
import {
  SolverCallError,
  type SolverResponsePayload,
} from './ports/solver-contract';

const dbError = () =>
  Object.assign(new Error('private connection and query data'), {
    code: 'ECONNRESET',
  });

function fixture() {
  const now = new Date();
  const coverage = {
    respondedParticipants: 0,
    totalParticipants: 3,
    submittedResponses: 0,
    expectedResponses: 6,
  };
  const metadata = {
    scoringProfile: 'CONDITION_AWARE',
    weights: { time: 40, travelBurden: 30, budget: 20, preference: 10 },
  };
  const job: CalculationJobRecord = {
    id: 'job-test',
    roomId: 'room-test',
    scoreResultId: 'score-test',
    snapshot: {
      requestId: 'request-test',
      roomId: 'room-test',
      policyVersion: 'condition-aware-1',
      scoringProfile: 'CONDITION_AWARE',
      participants: [],
      candidates: [],
    },
    status: CalculationJobStatus.REQUESTED,
    attemptCount: 0,
    maxAttempts: 2,
    nextAttemptAt: now,
    lockedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const score: ScoreResultRecord = {
    id: job.scoreResultId,
    roomId: job.roomId,
    clientRequestId: 'client-test',
    status: ScoreResultStatus.REQUESTED,
    policyVersion: job.snapshot.policyVersion,
    scoringProfile: job.snapshot.scoringProfile,
    inputSnapshotHash: 'snapshot-test',
    participantCount: 3,
    candidateCount: 2,
    coverage,
    recommendationStatus: null,
    recommendationWarnings: [],
    ranking: [],
    candidates: [],
    metadata,
    error: null,
    createdAt: now,
    completedAt: null,
  };
  let state = {
    job,
    score,
    room: {
      id: job.roomId,
      status: RoomStatus.CALCULATING,
      latestScoreResultId: score.id,
      updatedAt: now,
    },
  };
  const fault = { claim: false, complete: false, failure: false };
  const transaction = jest.fn(
    async <T>(
      work: (repositories: RoomsRepositories) => Promise<T>
    ): Promise<T> => {
      const draft = structuredClone(state);
      const repositories = {
        calculationJobs: {
          claimNextRunnable: async (at: Date, expired: Date) => {
            if (
              draft.job.status === CalculationJobStatus.REQUESTED &&
              draft.job.nextAttemptAt > at
            )
              return null;
            if (
              draft.job.status === CalculationJobStatus.RUNNING &&
              draft.job.lockedAt! > expired
            )
              return null;
            if (
              ![
                CalculationJobStatus.REQUESTED,
                CalculationJobStatus.RUNNING,
              ].includes(draft.job.status)
            )
              return null;
            draft.job = {
              ...draft.job,
              status: CalculationJobStatus.RUNNING,
              attemptCount: draft.job.attemptCount + 1,
              lockedAt: at,
            };
            if (fault.claim) throw dbError();
            return structuredClone(draft.job);
          },
          findById: async () => structuredClone(draft.job),
          save: async (value: CalculationJobRecord) => {
            draft.job = structuredClone(value);
            return value;
          },
        },
        scoreResults: {
          findById: async () => structuredClone(draft.score),
          save: async (value: ScoreResultRecord) => {
            draft.score = structuredClone(value);
            if (fault.complete && value.status === ScoreResultStatus.COMPLETED)
              throw dbError();
            if (fault.failure && value.error) throw dbError();
            return value;
          },
        },
        rooms: {
          findById: async () => structuredClone(draft.room),
          save: async (value: typeof draft.room) => {
            draft.room = structuredClone(value);
            return value;
          },
        },
      } as unknown as RoomsRepositories;
      const value = await work(repositories);
      state = draft;
      return value;
    }
  );
  const response: SolverResponsePayload = {
    requestId: 'request-test',
    policyVersion: 'condition-aware-1',
    scoringProfile: 'CONDITION_AWARE',
    status: 'COMPLETED',
    recommendationStatus: 'RECOMMENDED',
    recommendationWarnings: [],
    coverage,
    metadata,
    ranking: [],
    candidates: [],
  };
  const solve = jest
    .fn<Promise<SolverResponsePayload>, []>()
    .mockResolvedValue(response);
  const runner = new CalculationJobRunner(
    { transaction } as RoomsPersistencePort,
    { solve } as SolverPort
  );
  return { runner, fault, transaction, solve, response, state: () => state };
}

async function flush() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

describe('CalculationJobRunner persistence recovery', () => {
  let warn: jest.SpyInstance;
  let loggedError: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-02T00:00:00Z'));
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    loggedError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('contains a claim failure without committing an attempt or a Solver failure', async () => {
    const f = fixture();
    const before = structuredClone(f.state());
    f.fault.claim = true;
    await expect(f.runner.runOne()).resolves.toBe(false);
    expect(f.state()).toEqual(before);
    expect(f.solve).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'claim', code: 'ECONNRESET' })
    );
    f.fault.claim = false;
    f.runner.trigger();
    await flush();
    expect(f.state().job.status).toBe(CalculationJobStatus.COMPLETED);
  });

  it('contains an unexpected rejection from fire-and-forget drain', async () => {
    const f = fixture();
    jest
      .spyOn(f.runner as unknown as { drain(): Promise<void> }, 'drain')
      .mockRejectedValue(new TypeError('private diagnostic'));
    f.runner.trigger();
    await flush();
    expect(loggedError).toHaveBeenCalledWith({
      stage: 'drain',
      code: 'UNKNOWN',
      kind: 'unexpected',
    });
  });

  it('releases drain after failure and retries only on the next polling interval', async () => {
    const f = fixture();
    f.fault.claim = true;
    f.runner.onApplicationBootstrap();
    f.runner.trigger();
    await flush();
    expect(f.transaction).toHaveBeenCalledTimes(1);
    f.fault.claim = false;
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.state().job.status).toBe(CalculationJobStatus.COMPLETED);
    f.runner.onModuleDestroy();
  });

  it('rolls back completion without writing SOLVER_ERROR and completes after lease expiry', async () => {
    const f = fixture();
    f.fault.complete = true;
    await expect(f.runner.runOne()).resolves.toBe(false);
    expect(f.state().job).toMatchObject({
      status: 'RUNNING',
      attemptCount: 1,
      lastError: null,
    });
    expect(f.state().score).toMatchObject({
      status: 'RUNNING',
      error: null,
      completedAt: null,
    });
    expect(f.state().room.status).toBe(RoomStatus.CALCULATING);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'complete',
        jobId: 'job-test',
        scoreResultId: 'score-test',
      })
    );
    f.fault.complete = false;
    expect(await f.runner.runOne()).toBe(false);
    jest.advanceTimersByTime(30_001);
    expect(await f.runner.runOne()).toBe(true);
    expect(f.state().job.status).toBe(CalculationJobStatus.COMPLETED);
    expect(f.state().room.status).toBe(RoomStatus.CALCULATED);
    expect(f.solve).toHaveBeenCalledTimes(2);
    expect(f.solve.mock.calls[0]).toEqual(f.solve.mock.calls[1]);
  });

  it.each([true, false])(
    'rolls back Solver failure persistence (retryable=%s) and recovers through lease',
    async (retryable) => {
      const f = fixture();
      f.solve.mockRejectedValue(
        new SolverCallError(
          'SOLVER_UNAVAILABLE',
          'Solver unavailable',
          retryable
        )
      );
      f.fault.failure = true;
      await expect(f.runner.runOne()).resolves.toBe(false);
      expect(f.state().job).toMatchObject({
        status: 'RUNNING',
        lastError: null,
      });
      expect(f.state().score).toMatchObject({ status: 'RUNNING', error: null });
      expect(f.state().room.status).toBe(RoomStatus.CALCULATING);
      f.fault.failure = false;
      jest.advanceTimersByTime(30_001);
      await f.runner.runOne();
      expect(f.state().job).toMatchObject({
        status: 'FAILED',
        attemptCount: 2,
      });
      expect(f.state().score.error?.code).toBe('SOLVER_UNAVAILABLE');
      expect(f.state().room.status).toBe(RoomStatus.OPEN);
    }
  );

  it('keeps retry delay, maximum attempts and permanent Solver failure policy', async () => {
    const f = fixture();
    f.solve.mockRejectedValue(
      new SolverCallError('SOLVER_UNAVAILABLE', 'Unavailable', true)
    );
    await f.runner.runOne();
    expect(f.state().job).toMatchObject({
      status: 'REQUESTED',
      attemptCount: 1,
      lockedAt: null,
    });
    expect(await f.runner.runOne()).toBe(false);
    jest.advanceTimersByTime(1000);
    await f.runner.runOne();
    expect(f.state().job.status).toBe(CalculationJobStatus.FAILED);
    const permanent = fixture();
    permanent.solve.mockRejectedValue(
      new SolverCallError('SOLVER_ERROR', 'Invalid response', false)
    );
    await permanent.runner.runOne();
    expect(permanent.state().job).toMatchObject({
      status: 'FAILED',
      attemptCount: 1,
    });
  });

  it('does not start a second drain while Solver is running and ignores stale completion', async () => {
    const f = fixture();
    let finish!: (response: SolverResponsePayload) => void;
    f.solve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    f.runner.trigger();
    await flush();
    f.runner.trigger();
    expect(f.solve).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30_001);
    const replacement = new CalculationJobRunner(
      { transaction: f.transaction },
      { solve: f.solve }
    );
    await replacement.runOne();
    const completed = structuredClone(f.state());
    finish({ ...f.response, recommendationStatus: 'STALE_RESPONSE' });
    await flush();
    expect(f.state()).toEqual(completed);
  });

  it('stops new claims after shutdown while allowing an in-flight completion', async () => {
    const f = fixture();
    let finish!: (response: SolverResponsePayload) => void;
    f.solve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    f.runner.onApplicationBootstrap();
    await flush();
    f.runner.onModuleDestroy();
    finish(f.response);
    await flush();
    const count = f.transaction.mock.calls.length;
    f.runner.trigger();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await f.runner.runOne()).toBe(false);
    expect(f.transaction).toHaveBeenCalledTimes(count);
    expect(f.state().job.status).toBe(CalculationJobStatus.COMPLETED);
  });

  it('logs unknown failures as errors without leaking raw diagnostic data', async () => {
    const f = fixture();
    f.transaction.mockRejectedValueOnce(
      new TypeError('DATABASE_URL private snapshot')
    );
    await expect(f.runner.runOne()).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(loggedError).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'claim',
        code: 'UNKNOWN',
        kind: 'unexpected',
      })
    );
    expect(JSON.stringify(loggedError.mock.calls)).not.toMatch(
      /DATABASE_URL|private snapshot/
    );
  });
});

import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Participant } from '../../infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../../infrastructure/persistence/typeorm/entities/candidate.entity';
import { ParticipantResponse } from '../../infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from '../../infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { ScoreResult } from '../../infrastructure/persistence/typeorm/entities/score-result.entity';
import { Room } from '../../infrastructure/persistence/typeorm/entities/room.entity';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../domain/participant/participant';
import { CandidateStatus } from '../../domain/candidate/candidate';
import {
  AvailabilityStatus,
  ParticipantResponseStatus,
  TravelBurden,
} from '../../domain/participant-response/participant-response';
import { ScoreResultStatus } from '../../domain/calculation/score-result';
import { RoomStatus } from '../../domain/room/room-status';
import type {
  SolverResponsePayload,
  SolverSnapshot,
} from '../ports/solver-contract';
import { StartCalculationUseCase } from './start-calculation.use-case';
import { UpsertParticipantResponseUseCase } from './upsert-participant-response.use-case';
import { TypeOrmRoomsPersistenceAdapter } from '../../infrastructure/persistence/typeorm/typeorm-rooms-persistence.adapter';
import { TypeOrmRoomAccessAdapter } from '../../infrastructure/persistence/typeorm/typeorm-room-access.adapter';
import { AccessTokenAdapter } from '../../infrastructure/security/access-token.adapter';
import { SolverAdapter } from '../../infrastructure/solver/solver.adapter';
import { SolverHttpClient } from '../../infrastructure/solver/solver-http-client';
import { Decision } from '../../infrastructure/persistence/typeorm/entities/decision.entity';
import {
  toStartCalculationResponse,
  toUpsertedParticipantResponse,
} from '../../presentation/http/view-models/room-response';

type CalculationStore = {
  rooms: Map<string, Room>;
  participants: Map<string, Participant>;
  candidates: Map<string, Candidate>;
  responses: Map<string, ParticipantResponse>;
  conditions: Map<string, ParticipantCondition>;
  scoreResults: Map<string, ScoreResult>;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseSolverSnapshot(init: RequestInit | undefined): SolverSnapshot {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body');
  }
  return JSON.parse(init.body) as SolverSnapshot;
}

function matches(
  value: Record<string, unknown>,
  where: Record<string, unknown>
) {
  return Object.entries(where).every(
    ([key, expected]) => value[key] === expected
  );
}

function createCalculationDataSource(store: CalculationStore) {
  const repositoryFor = (entity: unknown) => {
    if (entity === Room) {
      return createRepository(store.rooms);
    }
    if (entity === Participant) {
      return createRepository(store.participants);
    }
    if (entity === Candidate) {
      return createRepository(store.candidates);
    }
    if (entity === ParticipantResponse) {
      return createRepository(store.responses);
    }
    if (entity === ParticipantCondition) {
      return createConditionRepository(store.conditions);
    }
    if (entity === ScoreResult) {
      return createRepository(store.scoreResults);
    }
    if (entity === Decision) {
      return createRepository(new Map<string, Decision>());
    }
    throw new Error('Unknown repository');
  };

  const dataSource = {
    getRepository: repositoryFor,
    transaction: async (
      callback: (manager: {
        getRepository: (entity: unknown) => unknown;
      }) => Promise<unknown>
    ) => callback({ getRepository: repositoryFor }),
  };

  return dataSource as unknown as DataSource;
}

function createCalculationService(dataSource: DataSource) {
  const persistence = new TypeOrmRoomsPersistenceAdapter(dataSource);
  const access = new TypeOrmRoomAccessAdapter(
    dataSource,
    new AccessTokenAdapter()
  );
  const startCalculation = new StartCalculationUseCase(
    persistence,
    access,
    new SolverAdapter(new SolverHttpClient())
  );

  return {
    startCalculation: async (
      ...args: Parameters<StartCalculationUseCase['execute']>
    ) => toStartCalculationResponse(await startCalculation.execute(...args)),
  };
}

function createParticipantResponseService(dataSource: DataSource) {
  const service = new UpsertParticipantResponseUseCase(
    new TypeOrmRoomsPersistenceAdapter(dataSource),
    new TypeOrmRoomAccessAdapter(dataSource, new AccessTokenAdapter())
  );
  return {
    upsertParticipantResponse: async (
      ...args: Parameters<UpsertParticipantResponseUseCase['execute']>
    ) => toUpsertedParticipantResponse(await service.execute(...args)),
  };
}

function createRepository<T extends { id: string }>(store: Map<string, T>) {
  return {
    create(attributes: Partial<T>) {
      return { ...attributes } as T;
    },
    save(value: T) {
      const saved = value as T & { createdAt?: Date };
      if (!saved.createdAt) {
        saved.createdAt = new Date();
      }
      store.set(value.id, value);
      return value;
    },
    findOne(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    findOneBy(where: Record<string, unknown>) {
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    find(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].filter((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
  };
}

function createConditionRepository(store: Map<string, ParticipantCondition>) {
  return {
    findOne(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    findOneBy(where: Record<string, unknown>) {
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    find(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].filter((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    save(value: ParticipantCondition) {
      store.set(value.participantId, value);
      return value;
    },
  };
}

function createSeed() {
  const store: CalculationStore = {
    rooms: new Map(),
    participants: new Map(),
    candidates: new Map(),
    responses: new Map(),
    conditions: new Map(),
    scoreResults: new Map(),
  };
  const roomId = 'room-calculation';
  const hostToken = 'host-token';
  const room = Object.assign(new Room(), {
    id: roomId,
    roomCode: 'CALC01',
    title: 'Calculation room',
    timezone: 'Asia/Seoul',
    status: RoomStatus.OPEN,
    hostParticipantId: 'participant-host',
    maxParticipants: 6,
    latestScoreResultId: null,
    currentDecisionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  store.rooms.set(roomId, room);

  const participants = [
    ['participant-host', ParticipantRole.HOST, hostToken],
    ['participant-member-1', ParticipantRole.MEMBER, 'member-token-1'],
    ['participant-member-2', ParticipantRole.MEMBER, 'member-token-2'],
  ] as const;
  for (const [id, role, token] of participants) {
    store.participants.set(
      id,
      Object.assign(new Participant(), {
        id,
        roomId,
        displayName: id,
        role,
        status: ParticipantStatus.JOINED,
        tokenHash: hashToken(token),
        tokenExpiresAt: new Date(Date.now() + 60_000),
        tokenRevokedAt: null,
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
    );
  }

  for (const participantId of store.participants.keys()) {
    store.conditions.set(
      participantId,
      Object.assign(new ParticipantCondition(), {
        participantId,
        roomId,
        availabilityWindows: [
          {
            startsAt: '2026-09-01T09:00:00.000Z',
            endsAt: '2026-09-01T18:00:00.000Z',
          },
        ],
        maxBudgetKrw: null,
        requiredTags: [],
        preferredTags: [],
        avoidTags: [],
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
    );
  }

  for (const [id, displayOrder] of [
    ['candidate-1', 1],
    ['candidate-2', 2],
  ] as const) {
    store.candidates.set(
      id,
      Object.assign(new Candidate(), {
        id,
        roomId,
        displayOrder,
        time: {
          startsAt: '2026-09-01T10:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
          timezone: 'Asia/Seoul',
        },
        place: { name: id, address: 'Address', area: 'Area' },
        estimatedCostPerPersonKrw: 15000,
        tags: [],
        status: CandidateStatus.ACTIVE,
        version: 1,
        archivedAt: null,
        createdByParticipantId: 'participant-host',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  }

  for (const participantId of store.participants.keys()) {
    for (const candidateId of store.candidates.keys()) {
      const id = `${participantId}-${candidateId}`;
      store.responses.set(
        id,
        Object.assign(new ParticipantResponse(), {
          id,
          roomId,
          participantId,
          candidateId,
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          travelBurden: TravelBurden.EASY,
          note: null,
          status: ParticipantResponseStatus.SUBMITTED,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
      );
    }
  }

  return { store, roomId, hostToken, memberToken: 'member-token-1' };
}

function solverResponseFromSnapshot(
  snapshot: SolverSnapshot
): SolverResponsePayload {
  const expectedResponses =
    snapshot.participants.length * snapshot.candidates.length;
  const respondedParticipants = snapshot.participants.filter(
    (participant) => participant.responses.length > 0
  ).length;
  const candidateResults: SolverResponsePayload['candidates'] =
    snapshot.candidates.map((candidate, index) => {
      const participantResponses = snapshot.participants.map((participant) =>
        participant.responses.find(
          (response) => response.candidateId === candidate.candidateId
        )
      );
      const submittedResponses = participantResponses.filter(Boolean).length;
      const hasMissingResponse =
        submittedResponses < snapshot.participants.length;

      return {
        candidateId: candidate.candidateId,
        rank: index + 1,
        overallScore: hasMissingResponse ? 0 : 100,
        eligible: !hasMissingResponse,
        matchLevel: hasMissingResponse ? 'INCOMPLETE' : 'FULL',
        hardConflictCount: 0,
        coverage: {
          submittedResponses,
          expectedResponses: snapshot.participants.length,
        },
        participantBreakdown: snapshot.participants.map(
          (participant, participantIndex) => {
            const hasResponse = Boolean(participantResponses[participantIndex]);

            return {
              participantId: participant.participantId,
              score: hasResponse ? 100 : 0,
              components: hasResponse
                ? { time: 40, travelBurden: 25, budget: 20, preference: 15 }
                : { time: 0, travelBurden: 0, budget: 0, preference: 0 },
              hardConflicts: [],
              blockingIssues: hasResponse ? [] : ['MISSING_RESPONSE'],
              reasons: hasResponse ? [] : ['response: MISSING'],
            };
          }
        ),
        reasons: [
          hasMissingResponse
            ? `${submittedResponses}/${snapshot.participants.length} responses submitted`
            : `${submittedResponses} responses submitted`,
        ],
        conflicts: [],
        blockingIssues: hasMissingResponse ? ['MISSING_RESPONSE'] : [],
        explanationFlags: hasMissingResponse
          ? ['MISSING_RESPONSE']
          : ['SELF_REPORTED_TRAVEL_BURDEN'],
      };
    });

  return {
    requestId: snapshot.requestId,
    policyVersion: snapshot.policyVersion,
    scoringProfile: snapshot.scoringProfile,
    status: 'COMPLETED',
    metadata: {
      scoringProfile: snapshot.scoringProfile,
      weights: { time: 40, travelBurden: 25, budget: 20, preference: 15 },
    },
    recommendationStatus: candidateResults.some(
      (candidate) => candidate.matchLevel === 'INCOMPLETE'
    )
      ? 'INCOMPLETE'
      : 'FULL_MATCH',
    recommendationWarnings: [],
    coverage: {
      respondedParticipants,
      totalParticipants: snapshot.participants.length,
      submittedResponses: candidateResults.reduce(
        (total, candidate) => total + candidate.coverage.submittedResponses,
        0
      ),
      expectedResponses,
    },
    ranking: snapshot.candidates.map((candidate) => candidate.candidateId),
    candidates: candidateResults,
  };
}

async function waitForStatus(
  store: CalculationStore,
  id: string,
  status: ScoreResultStatus
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = store.scoreResults.get(id);
    if (result?.status === status) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`ScoreResult did not become ${status}`);
}

describe('StartCalculationUseCase flow', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('allows HOST calculation and rejects MEMBER calculation', async () => {
    const seed = createSeed();
    globalThis.fetch = jest.fn((_input, init) => {
      const snapshot = parseSolverSnapshot(init);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(solverResponseFromSnapshot(snapshot)),
      } as Response;
    });
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-host-1',
      }
    );
    expect(started.calculation.status).toBe(ScoreResultStatus.RUNNING);
    await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.COMPLETED
    );
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(
      RoomStatus.CALCULATED
    );

    await expect(
      service.startCalculation(seed.roomId, seed.memberToken, {
        clientRequestId: 'client-member-1',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sends participant conditions and uses a completed result transition', async () => {
    const seed = createSeed();
    let solverInput!: SolverSnapshot;
    globalThis.fetch = jest.fn((_input, init) => {
      solverInput = parseSolverSnapshot(init);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(solverResponseFromSnapshot(solverInput)),
      } as Response;
    });
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-profile-1',
      }
    );
    const completed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.COMPLETED
    );

    expect(solverInput.scoringProfile).toBe('CONDITION_AWARE');
    expect(solverInput.participants[0].condition).toMatchObject({
      maxBudgetKrw: null,
      preferences: {
        requiredTags: [],
        preferredTags: [],
        avoidTags: [],
      },
    });
    expect(solverInput.participants[0].responses[0]).toMatchObject({
      availabilityStatus: 'AVAILABLE',
      travelBurden: 'EASY',
    });
    expect(completed.metadata.scoringProfile).toBe('CONDITION_AWARE');
    expect(completed.candidates[0].participantBreakdown[0].components).toEqual({
      time: 40,
      travelBurden: 25,
      budget: 20,
      preference: 15,
    });
  });

  it('keeps a missing response absent from the calculation snapshot', async () => {
    const seed = createSeed();
    seed.store.responses.delete('participant-member-1-candidate-2');
    let solverInput!: SolverSnapshot;
    globalThis.fetch = jest.fn((_input, init) => {
      solverInput = parseSolverSnapshot(init);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(solverResponseFromSnapshot(solverInput)),
      } as Response;
    });
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-missing-response',
      }
    );
    const completed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.COMPLETED
    );

    const memberSnapshot = solverInput.participants.find(
      (participant) => participant.participantId === 'participant-member-1'
    );
    const missingCandidateResult = completed.candidates.find(
      (candidate) => candidate.candidateId === 'candidate-2'
    );
    if (!missingCandidateResult) {
      throw new Error('Missing candidate result');
    }
    const missingParticipantResult =
      missingCandidateResult.participantBreakdown.find(
        (participant) => participant.participantId === 'participant-member-1'
      );
    if (!missingParticipantResult) {
      throw new Error('Missing participant result');
    }

    expect(memberSnapshot.responses).toEqual([
      expect.objectContaining({ candidateId: 'candidate-1' }),
    ]);
    expect(memberSnapshot.responses).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: 'candidate-2',
          availabilityStatus: AvailabilityStatus.AVAILABLE,
        }),
      ])
    );
    expect(completed.coverage).toMatchObject({
      submittedResponses: 5,
      expectedResponses: 6,
    });
    expect(missingCandidateResult).toMatchObject({
      matchLevel: 'INCOMPLETE',
      eligible: false,
      coverage: { submittedResponses: 2, expectedResponses: 3 },
      blockingIssues: ['MISSING_RESPONSE'],
    });
    expect(missingParticipantResult).toMatchObject({
      score: 0,
      components: { time: 0, travelBurden: 0, budget: 0, preference: 0 },
      blockingIssues: ['MISSING_RESPONSE'],
    });
  });

  it('marks the previous completed result stale when an OPEN room is edited after reopen', async () => {
    const seed = createSeed();
    globalThis.fetch = jest.fn((_input, init) => {
      const snapshot = parseSolverSnapshot(init);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(solverResponseFromSnapshot(snapshot)),
      } as Response;
    });
    const dataSource = createCalculationDataSource(seed.store);
    const service = createCalculationService(dataSource);
    const responseService = createParticipantResponseService(dataSource);

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-reopen-edit',
      }
    );
    const completed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.COMPLETED
    );
    seed.store.rooms.get(seed.roomId)!.status = RoomStatus.OPEN;

    await responseService.upsertParticipantResponse(
      seed.roomId,
      'participant-host',
      'candidate-1',
      seed.hostToken,
      {
        availabilityStatus: AvailabilityStatus.MAYBE,
        travelBurden: TravelBurden.NORMAL,
        note: null,
      }
    );

    expect(seed.store.scoreResults.get(completed.id)?.status).toBe(
      ScoreResultStatus.STALE
    );
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
  });

  it.each([
    [
      'no active participants',
      (seed: CalculationStore) => {
        for (const participant of seed.participants.values()) {
          if (participant.role === ParticipantRole.MEMBER) {
            participant.status = ParticipantStatus.LEFT;
            participant.tokenRevokedAt = new Date();
          }
        }
      },
      'PARTICIPANT_COUNT_OUT_OF_RANGE',
    ],
    [
      'no active candidates',
      (seed: CalculationStore) => {
        seed.candidates.clear();
      },
      'NO_ACTIVE_CANDIDATES',
    ],
  ])('rejects calculation when there are %s', async (_label, prepare, code) => {
    const seed = createSeed();
    prepare(seed.store);
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    let thrown: unknown;
    try {
      await service.startCalculation(seed.roomId, seed.hostToken, {
        clientRequestId: `client-empty-${_label}`,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(
      (thrown as UnprocessableEntityException).getResponse()
    ).toMatchObject({
      message: code,
    });
    expect(seed.store.scoreResults.size).toBe(0);
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
    expect(
      [...seed.store.scoreResults.values()].some(
        (result) => result.error?.code === code
      )
    ).toBe(false);
  });

  it('rejects a different request while calculation is running', async () => {
    const seed = createSeed();
    let resolveSolver: (() => void) | undefined;
    globalThis.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSolver = () =>
            resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve(
                  solverResponseFromSnapshot({
                    requestId: 'req_unused',
                    policyVersion: 'mvp-1',
                    scoringProfile: 'MVP_NO_CONDITIONS',
                    candidates: [],
                    participants: [],
                  })
                ),
            });
        })
    ) as unknown as typeof fetch;
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-running-1',
      }
    );

    let thrown: unknown;
    try {
      await service.startCalculation(seed.roomId, seed.hostToken, {
        clientRequestId: 'client-running-2',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toMatchObject({
      message: 'CALCULATION_IN_PROGRESS',
      statusCode: 409,
    });
    resolveSolver?.();
    await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.FAILED
    );
  });

  it.each([
    [
      'timeout',
      () => Promise.reject(new Error('timeout')),
      'SOLVER_UNAVAILABLE',
    ],
    [
      'invalid response',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'COMPLETED' }),
        }),
      'SOLVER_ERROR',
    ],
  ])(
    'recovers the Room as OPEN when Solver %s',
    async (_label, fetchResult, code) => {
      const seed = createSeed();
      globalThis.fetch = jest.fn(() =>
        fetchResult()
      ) as unknown as typeof fetch;
      const service = createCalculationService(
        createCalculationDataSource(seed.store)
      );

      const started = await service.startCalculation(
        seed.roomId,
        seed.hostToken,
        {
          clientRequestId: `client-failure-${_label}`,
        }
      );
      const failed = await waitForStatus(
        seed.store,
        started.calculation.id,
        ScoreResultStatus.FAILED
      );

      expect(failed.error?.code).toBe(code);
      expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
    }
  );

  it('fails and recovers when Solver returns an invalid enum field', async () => {
    const seed = createSeed();
    globalThis.fetch = jest.fn((_input, init) => {
      const snapshot = parseSolverSnapshot(init);
      const response = solverResponseFromSnapshot(snapshot);
      response.candidates[0].matchLevel = 'UNKNOWN';
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      } as Response;
    });
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-invalid-enum',
      }
    );
    const failed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.FAILED
    );

    expect(failed.error?.code).toBe('SOLVER_ERROR');
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
  });

  it('fails and recovers when Solver returns an unknown candidate id', async () => {
    const seed = createSeed();
    globalThis.fetch = jest.fn((_input, init) => {
      const snapshot = parseSolverSnapshot(init);
      const response = solverResponseFromSnapshot(snapshot);
      response.candidates[0].candidateId = 'unknown-candidate';
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      } as Response;
    });
    const service = createCalculationService(
      createCalculationDataSource(seed.store)
    );

    const started = await service.startCalculation(
      seed.roomId,
      seed.hostToken,
      {
        clientRequestId: 'client-invalid-candidate-id',
      }
    );
    const failed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.FAILED
    );

    expect(failed.error?.code).toBe('SOLVER_ERROR');
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
  });
});

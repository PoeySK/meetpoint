/* eslint-disable */

import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import {
  AvailabilityStatus,
  ParticipantResponse,
  ParticipantResponseStatus,
  TravelBurden,
} from './entities/participant-response.entity';
import { ScoreResult, ScoreResultStatus } from './entities/score-result.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { RoomsService } from './rooms.service';

type CalculationStore = {
  rooms: Map<string, Room>;
  participants: Map<string, Participant>;
  candidates: Map<string, Candidate>;
  responses: Map<string, ParticipantResponse>;
  scoreResults: Map<string, ScoreResult>;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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
    if (entity === ScoreResult) {
      return createRepository(store.scoreResults);
    }
    throw new Error('Unknown repository');
  };

  const dataSource = {
    getRepository: repositoryFor,
    transaction: async (callback: (manager: any) => Promise<unknown>) =>
      callback({ getRepository: repositoryFor }),
  };

  return dataSource as unknown as DataSource;
}

function createRepository<T extends { id: string }>(store: Map<string, T>) {
  return {
    create(attributes: Partial<T>) {
      return { ...attributes } as T;
    },
    async save(value: T) {
      const saved = value as T & { createdAt?: Date };
      if (!saved.createdAt) {
        saved.createdAt = new Date();
      }
      store.set(value.id, value);
      return value;
    },
    async findOne(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    async findOneBy(where: Record<string, unknown>) {
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    async find(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      return [...store.values()].filter((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
  };
}

function createSeed() {
  const store: CalculationStore = {
    rooms: new Map(),
    participants: new Map(),
    candidates: new Map(),
    responses: new Map(),
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

function solverResponseFromSnapshot(snapshot: any) {
  const expectedResponses =
    snapshot.participants.length * snapshot.candidates.length;
  const respondedParticipants = snapshot.participants.filter(
    (participant: any) => participant.responses.length > 0
  ).length;
  const candidateResults = snapshot.candidates.map(
    (candidate: any, index: number) => {
      const participantResponses = snapshot.participants.map(
        (participant: any) =>
          participant.responses.find(
            (response: any) => response.candidateId === candidate.candidateId
          )
      );
      const submittedResponses = participantResponses.filter(Boolean).length;
      const hasMissingResponse = submittedResponses < snapshot.participants.length;

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
          (participant: any, participantIndex: number) => {
            const hasResponse = Boolean(participantResponses[participantIndex]);

            return {
              participantId: participant.participantId,
              score: hasResponse ? 100 : 0,
              components: hasResponse
                ? { time: 40, travelBurden: 25, budget: 20, preference: 15 }
                : { time: 0, travelBurden: 0, budget: 0, preference: 0 },
              hardConflicts: [],
              blockingIssues: hasResponse ? [] : ['MISSING_RESPONSE'],
              reasons: hasResponse
                ? []
                : ['response: MISSING'],
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
    }
  );

  return {
    requestId: snapshot.requestId,
    policyVersion: snapshot.policyVersion,
    scoringProfile: snapshot.scoringProfile,
    status: 'COMPLETED',
    metadata: {
      scoringProfile: 'MVP_NO_CONDITIONS',
      weights: { time: 40, travelBurden: 25, budget: 20, preference: 15 },
    },
    recommendationStatus: candidateResults.some(
      (candidate: any) => candidate.matchLevel === 'INCOMPLETE'
    )
      ? 'INCOMPLETE'
      : 'FULL_MATCH',
    recommendationWarnings: [],
    coverage: {
      respondedParticipants,
      totalParticipants: snapshot.participants.length,
      submittedResponses: candidateResults.reduce(
        (total: number, candidate: any) =>
          total + candidate.coverage.submittedResponses,
        0
      ),
      expectedResponses,
    },
    ranking: snapshot.candidates.map((candidate: any) => candidate.candidateId),
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

describe('RoomsService calculation flow', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('allows HOST calculation and rejects MEMBER calculation', async () => {
    const seed = createSeed();
    globalThis.fetch = jest.fn(async (_input, init) => {
      const snapshot = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => solverResponseFromSnapshot(snapshot),
      } as Response;
    });
    const service = new RoomsService(createCalculationDataSource(seed.store));

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

  it('sends the conditionless profile and uses a completed result transition', async () => {
    const seed = createSeed();
    let solverInput: any;
    globalThis.fetch = jest.fn(async (_input, init) => {
      solverInput = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => solverResponseFromSnapshot(solverInput),
      } as Response;
    });
    const service = new RoomsService(createCalculationDataSource(seed.store));

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

    expect(solverInput.scoringProfile).toBe('MVP_NO_CONDITIONS');
    expect(solverInput.participants[0].condition).toBeUndefined();
    expect(solverInput.participants[0].responses[0]).toMatchObject({
      availabilityStatus: 'AVAILABLE',
      travelBurden: 'EASY',
    });
    expect(completed.metadata.scoringProfile).toBe('MVP_NO_CONDITIONS');
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
    let solverInput: any;
    globalThis.fetch = jest.fn(async (_input, init) => {
      solverInput = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => solverResponseFromSnapshot(solverInput),
      } as Response;
    });
    const service = new RoomsService(createCalculationDataSource(seed.store));

    const started = await service.startCalculation(seed.roomId, seed.hostToken, {
      clientRequestId: 'client-missing-response',
    });
    const completed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.COMPLETED
    );

    const memberSnapshot = solverInput.participants.find(
      (participant: any) => participant.participantId === 'participant-member-1'
    );
    const missingCandidateResult = completed.candidates.find(
      (candidate: any) => candidate.candidateId === 'candidate-2'
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

  it.each([
    [
      'no active participants',
      (seed: CalculationStore) => {
        for (const participant of seed.participants.values()) {
          participant.status = ParticipantStatus.LEFT;
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
  ])(
    'rejects calculation when there are %s',
    async (_label, prepare, code) => {
      const seed = createSeed();
      prepare(seed.store);
      const service = new RoomsService(createCalculationDataSource(seed.store));

      let thrown: unknown;
      try {
        await service.startCalculation(seed.roomId, seed.hostToken, {
          clientRequestId: `client-empty-${_label}`,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(UnprocessableEntityException);
      expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject({
        message: code,
      });
      expect(seed.store.scoreResults.size).toBe(0);
      expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
      expect(
        [...seed.store.scoreResults.values()].some(
          (result) => result.error?.code === code
        )
      ).toBe(false);
    }
  );

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
              json: async () =>
                solverResponseFromSnapshot({
                  requestId: 'req_unused',
                  policyVersion: 'mvp-1',
                  scoringProfile: 'MVP_NO_CONDITIONS',
                  candidates: [],
                  participants: [],
                }),
            });
        })
    ) as unknown as typeof fetch;
    const service = new RoomsService(createCalculationDataSource(seed.store));

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
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: 'COMPLETED' }),
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
      const service = new RoomsService(createCalculationDataSource(seed.store));

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
    globalThis.fetch = jest.fn(async (_input, init) => {
      const snapshot = JSON.parse(String(init?.body));
      const response = solverResponseFromSnapshot(snapshot) as any;
      response.candidates[0].matchLevel = 'UNKNOWN';
      return {
        ok: true,
        status: 200,
        json: async () => response,
      } as Response;
    });
    const service = new RoomsService(createCalculationDataSource(seed.store));

    const started = await service.startCalculation(seed.roomId, seed.hostToken, {
      clientRequestId: 'client-invalid-enum',
    });
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
    globalThis.fetch = jest.fn(async (_input, init) => {
      const snapshot = JSON.parse(String(init?.body));
      const response = solverResponseFromSnapshot(snapshot) as any;
      response.candidates[0].candidateId = 'unknown-candidate';
      return {
        ok: true,
        status: 200,
        json: async () => response,
      } as Response;
    });
    const service = new RoomsService(createCalculationDataSource(seed.store));

    const started = await service.startCalculation(seed.roomId, seed.hostToken, {
      clientRequestId: 'client-invalid-candidate-id',
    });
    const failed = await waitForStatus(
      seed.store,
      started.calculation.id,
      ScoreResultStatus.FAILED
    );

    expect(failed.error?.code).toBe('SOLVER_ERROR');
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
  });
});

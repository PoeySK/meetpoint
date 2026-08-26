import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { DataSource, EntityManager } from 'typeorm';
import { Participant } from '../infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from '../infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from '../infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from '../infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { Room } from '../infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from '../infrastructure/persistence/typeorm/entities/score-result.entity';
import { ScoreResultStatus } from '../domain/calculation/score-result';
import { DecisionController } from '../presentation/http/controllers/decision.controller';
import { CandidateController } from '../presentation/http/controllers/candidate.controller';
import { CalculationController } from '../presentation/http/controllers/calculation.controller';
import { RoomsController } from '../presentation/http/controllers/rooms.controller';
import { ParticipantLifecycleController } from '../presentation/http/controllers/participant-lifecycle.controller';
import { ParticipantResponseController } from '../presentation/http/controllers/participant-response.controller';
import { ParticipantConditionController } from '../presentation/http/controllers/participant-condition.controller';
import { CreateRoomUseCase } from '../application/commands/create-room.use-case';
import { JoinParticipantUseCase } from '../application/commands/join-participant.use-case';
import { CreateCandidateUseCase } from '../application/commands/create-candidate.use-case';
import { UpsertParticipantResponseUseCase } from '../application/commands/upsert-participant-response.use-case';
import { UpsertParticipantConditionUseCase } from '../application/commands/upsert-participant-condition.use-case';
import { LeaveRoomUseCase } from '../application/commands/leave-room.use-case';
import { KickParticipantUseCase } from '../application/commands/kick-participant.use-case';
import { StartCalculationUseCase } from '../application/commands/start-calculation.use-case';
import { ConfirmDecisionUseCase } from '../application/commands/confirm-decision.use-case';
import { ReopenDecisionUseCase } from '../application/commands/reopen-decision.use-case';
import { GetRoomQuery } from '../application/queries/get-room.query';
import { GetCalculationQuery } from '../application/queries/get-calculation.query';
import { GetLatestScoreResultQuery } from '../application/queries/get-latest-score-result.query';
import { GetDecisionQuery } from '../application/queries/get-decision.query';
import { TypeOrmRoomsPersistenceAdapter } from '../infrastructure/persistence/typeorm/typeorm-rooms-persistence.adapter';
import { TypeOrmRoomAccessAdapter } from '../infrastructure/persistence/typeorm/typeorm-room-access.adapter';
import { AccessTokenAdapter } from '../infrastructure/security/access-token.adapter';
import { SolverAdapter } from '../infrastructure/solver/solver.adapter';
import { SolverHttpClient } from '../infrastructure/solver/solver-http-client';
import {
  ACCESS_TOKEN,
  ROOM_ACCESS,
} from '../application/ports/room-access.port';
import { ROOMS_PERSISTENCE } from '../application/ports/rooms-persistence.port';
import { SOLVER } from '../application/ports/solver.port';

type CreateRoomPayload = {
  title?: unknown;
  timezone?: unknown;
  host?: {
    displayName?: unknown;
  };
};

type RoomStore = Map<string, Room>;
type ParticipantStore = Map<string, Participant>;
type CandidateStore = Map<string, Candidate>;
type ParticipantResponseStore = Map<string, ParticipantResponse>;
type DecisionStore = Map<string, Decision>;
type ScoreResultStore = Map<string, ScoreResult>;
type ParticipantConditionStore = Map<string, ParticipantCondition>;

export type MockDatabase = {
  dataSource: DataSource;
  rooms: RoomStore;
  participants: ParticipantStore;
  candidates: CandidateStore;
  responses: ParticipantResponseStore;
  decisions: DecisionStore;
  scoreResults: ScoreResultStore;
  conditions: ParticipantConditionStore;
  roomRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  participantRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  candidateRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  responseRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  decisionRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  scoreResultRepository: {
    save: jest.Mock;
    findOneBy: jest.Mock;
  };
  conditionRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  failRoomSave: boolean;
  failParticipantSave: boolean;
  failCandidateSave: boolean;
  failResponseSave: boolean;
  failScoreResultSave: boolean;
  failConditionSave: boolean;
};

export function createMockDatabase(): MockDatabase {
  const rooms: RoomStore = new Map();
  const participants: ParticipantStore = new Map();
  const candidates: CandidateStore = new Map();
  const responses: ParticipantResponseStore = new Map();
  const decisions: DecisionStore = new Map();
  const scoreResults: ScoreResultStore = new Map();
  const conditions: ParticipantConditionStore = new Map();
  const state = {
    failRoomSave: false,
    failParticipantSave: false,
    failCandidateSave: false,
    failResponseSave: false,
    failScoreResultSave: false,
    failConditionSave: false,
  };
  let transactionTail = Promise.resolve();

  const roomRepository = {
    create: jest.fn((attributes: Partial<Room>) => ({
      ...attributes,
      createdAt: attributes.createdAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((room: Room) => {
      if (state.failRoomSave) {
        throw new Error('room save failed');
      }
      rooms.set(room.id, room);
      return room;
    }),
    findOne: jest.fn((options: { where?: Partial<Room> }) => {
      const room = [...rooms.values()].find((candidate) =>
        Object.entries(options.where ?? {}).every(
          ([key, value]) => candidate[key as keyof Room] === value
        )
      );

      return room ? { ...room } : null;
    }),
    findOneBy: jest.fn((criteria: Partial<Room>) => {
      if (criteria.id) {
        return rooms.get(criteria.id) ?? null;
      }

      if (criteria.roomCode) {
        return (
          [...rooms.values()].find(
            (room) => room.roomCode === criteria.roomCode
          ) ?? null
        );
      }

      return null;
    }),
  };

  const participantRepository = {
    create: jest.fn((attributes: Partial<Participant>) => ({
      ...attributes,
      joinedAt: attributes.joinedAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((participant: Participant) => {
      if (state.failParticipantSave) {
        throw new Error('participant save failed');
      }

      participants.set(participant.id, participant);
      return participant;
    }),
    findOneBy: jest.fn((criteria: Partial<Participant>) => {
      if (criteria.id) {
        return participants.get(criteria.id) ?? null;
      }

      if (criteria.tokenHash) {
        return (
          [...participants.values()].find(
            (participant) => participant.tokenHash === criteria.tokenHash
          ) ?? null
        );
      }

      return null;
    }),
    find: jest.fn((options: { where?: { roomId?: string } }) => {
      const roomId = options.where?.roomId;

      return [...participants.values()]
        .filter((participant) => participant.roomId === roomId)
        .sort(
          (left, right) => left.joinedAt.getTime() - right.joinedAt.getTime()
        );
    }),
  };

  const candidateRepository = {
    create: jest.fn((attributes: Partial<Candidate>) => ({
      ...attributes,
      createdAt: attributes.createdAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((candidate: Candidate) => {
      if (state.failCandidateSave) {
        throw new Error('candidate save failed');
      }

      candidates.set(candidate.id, candidate);
      return candidate;
    }),
    find: jest.fn((options: { where?: Partial<Candidate> }) => {
      const where = options.where ?? {};

      return [...candidates.values()]
        .filter((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof Candidate] === value
          )
        )
        .sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.createdAt.getTime() - right.createdAt.getTime()
        );
    }),
    findOne: jest.fn((options: { where?: Partial<Candidate> }) => {
      const where = options.where ?? {};

      return (
        [...candidates.values()].find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof Candidate] === value
          )
        ) ?? null
      );
    }),
    findOneBy: jest.fn((criteria: Partial<Candidate>) => {
      return (
        [...candidates.values()].find((candidate) =>
          Object.entries(criteria).every(
            ([key, value]) => candidate[key as keyof Candidate] === value
          )
        ) ?? null
      );
    }),
  };

  const responseRepository = {
    create: jest.fn((attributes: Partial<ParticipantResponse>) => ({
      ...attributes,
      submittedAt: attributes.submittedAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((response: ParticipantResponse) => {
      if (state.failResponseSave) {
        throw new Error('response save failed');
      }

      response.updatedAt = new Date();
      responses.set(response.id, response);
      return response;
    }),
    find: jest.fn((options: { where?: Partial<ParticipantResponse> }) => {
      const where = options.where ?? {};

      return [...responses.values()].filter((response) =>
        Object.entries(where).every(
          ([key, value]) => response[key as keyof ParticipantResponse] === value
        )
      );
    }),
    findOne: jest.fn((options: { where?: Partial<ParticipantResponse> }) => {
      const where = options.where ?? {};

      return (
        [...responses.values()].find((response) =>
          Object.entries(where).every(
            ([key, value]) =>
              response[key as keyof ParticipantResponse] === value
          )
        ) ?? null
      );
    }),
    findOneBy: jest.fn((criteria: Partial<ParticipantResponse>) => {
      return (
        [...responses.values()].find((response) =>
          Object.entries(criteria).every(
            ([key, value]) =>
              response[key as keyof ParticipantResponse] === value
          )
        ) ?? null
      );
    }),
  };

  const decisionRepository = {
    create: jest.fn((attributes: Partial<Decision>) => ({
      ...attributes,
      createdAt: attributes.createdAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((decision: Decision) => {
      decisions.set(decision.id, decision);
      return decision;
    }),
    findOneBy: jest.fn((criteria: Partial<Decision>) => {
      return (
        [...decisions.values()].find((decision) =>
          Object.entries(criteria).every(
            ([key, value]) => decision[key as keyof Decision] === value
          )
        ) ?? null
      );
    }),
    find: jest.fn((options: { where?: Partial<Decision> }) => {
      const where = options.where ?? {};
      return [...decisions.values()].filter((decision) =>
        Object.entries(where).every(
          ([key, value]) => decision[key as keyof Decision] === value
        )
      );
    }),
  };

  const scoreResultRepository = {
    save: jest.fn((scoreResult: ScoreResult) => {
      if (state.failScoreResultSave) {
        throw new Error('score result save failed');
      }

      scoreResults.set(scoreResult.id, scoreResult);
      return scoreResult;
    }),
    findOneBy: jest.fn((criteria: Partial<ScoreResult>) => {
      return (
        [...scoreResults.values()].find((scoreResult) =>
          Object.entries(criteria).every(
            ([key, value]) => scoreResult[key as keyof ScoreResult] === value
          )
        ) ?? null
      );
    }),
    findOne: jest.fn((options: { where?: Partial<ScoreResult> }) => {
      const criteria = options.where ?? {};
      return (
        [...scoreResults.values()].find((scoreResult) =>
          Object.entries(criteria).every(
            ([key, value]) => scoreResult[key as keyof ScoreResult] === value
          )
        ) ?? null
      );
    }),
  };

  const conditionRepository = {
    create: jest.fn((attributes: Partial<ParticipantCondition>) => ({
      ...attributes,
      submittedAt: attributes.submittedAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn((condition: ParticipantCondition) => {
      if (state.failConditionSave) {
        throw new Error('condition save failed');
      }

      conditions.set(condition.participantId, condition);
      return condition;
    }),
    findOneBy: jest.fn((criteria: Partial<ParticipantCondition>) => {
      return (
        [...conditions.values()].find((condition) =>
          Object.entries(criteria).every(
            ([key, value]) =>
              condition[key as keyof ParticipantCondition] === value
          )
        ) ?? null
      );
    }),
    find: jest.fn((options: { where?: Partial<ParticipantCondition> }) => {
      const where = options.where ?? {};
      return [...conditions.values()].filter((condition) =>
        Object.entries(where).every(
          ([key, value]) =>
            condition[key as keyof ParticipantCondition] === value
        )
      );
    }),
  };

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Room) {
        return roomRepository;
      }
      if (entity === Participant) {
        return participantRepository;
      }
      if (entity === Candidate) {
        return candidateRepository;
      }
      if (entity === Decision) {
        return decisionRepository;
      }
      if (entity === ScoreResult) {
        return scoreResultRepository;
      }
      if (entity === ParticipantCondition) {
        return conditionRepository;
      }
      return responseRepository;
    }),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(
      async (
        callback: (transactionManager: EntityManager) => Promise<unknown>
      ) => {
        const previousTransaction = transactionTail;
        let releaseTransaction: (() => void) | undefined;
        transactionTail = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        await previousTransaction;

        const cloneStore = <T extends object>(store: Map<string, T>) =>
          new Map([...store].map(([id, value]) => [id, { ...value }] as const));
        const roomsBeforeTransaction = cloneStore(rooms);
        const participantsBeforeTransaction = cloneStore(participants);
        const candidatesBeforeTransaction = cloneStore(candidates);
        const responsesBeforeTransaction = cloneStore(responses);
        const decisionsBeforeTransaction = cloneStore(decisions);
        const scoreResultsBeforeTransaction = cloneStore(scoreResults);
        const conditionsBeforeTransaction = cloneStore(conditions);

        try {
          return await callback(manager);
        } catch (error) {
          rooms.clear();
          for (const [id, room] of roomsBeforeTransaction) {
            rooms.set(id, room);
          }

          participants.clear();
          for (const [id, participant] of participantsBeforeTransaction) {
            participants.set(id, participant);
          }

          candidates.clear();
          for (const [id, candidate] of candidatesBeforeTransaction) {
            candidates.set(id, candidate);
          }

          responses.clear();
          for (const [id, response] of responsesBeforeTransaction) {
            responses.set(id, response);
          }

          decisions.clear();
          for (const [id, decision] of decisionsBeforeTransaction) {
            decisions.set(id, decision);
          }

          scoreResults.clear();
          for (const [id, scoreResult] of scoreResultsBeforeTransaction) {
            scoreResults.set(id, scoreResult);
          }

          conditions.clear();
          for (const [id, condition] of conditionsBeforeTransaction) {
            conditions.set(id, condition);
          }

          throw error;
        } finally {
          releaseTransaction?.();
        }
      }
    ),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Room) {
        return roomRepository;
      }
      if (entity === Participant) {
        return participantRepository;
      }
      if (entity === Candidate) {
        return candidateRepository;
      }
      if (entity === Decision) {
        return decisionRepository;
      }
      if (entity === ScoreResult) {
        return scoreResultRepository;
      }
      if (entity === ParticipantCondition) {
        return conditionRepository;
      }
      return responseRepository;
    }),
  } as unknown as DataSource;

  return {
    dataSource,
    rooms,
    participants,
    candidates,
    responses,
    decisions,
    scoreResults,
    conditions,
    scoreResultRepository,
    conditionRepository,
    roomRepository,
    participantRepository,
    candidateRepository,
    responseRepository,
    decisionRepository,
    get failParticipantSave() {
      return state.failParticipantSave;
    },
    set failParticipantSave(value: boolean) {
      state.failParticipantSave = value;
    },
    get failRoomSave() {
      return state.failRoomSave;
    },
    set failRoomSave(value: boolean) {
      state.failRoomSave = value;
    },
    get failCandidateSave() {
      return state.failCandidateSave;
    },
    set failCandidateSave(value: boolean) {
      state.failCandidateSave = value;
    },
    get failResponseSave() {
      return state.failResponseSave;
    },
    set failResponseSave(value: boolean) {
      state.failResponseSave = value;
    },
    get failScoreResultSave() {
      return state.failScoreResultSave;
    },
    set failScoreResultSave(value: boolean) {
      state.failScoreResultSave = value;
    },
    get failConditionSave() {
      return state.failConditionSave;
    },
    set failConditionSave(value: boolean) {
      state.failConditionSave = value;
    },
  };
}

export function validPayload(overrides: CreateRoomPayload = {}) {
  return {
    title: overrides.title ?? 'Room test',
    timezone: overrides.timezone ?? 'Asia/Seoul',
    host: {
      displayName: overrides.host?.displayName ?? 'Host test',
    },
  };
}

export function validCandidatePayload(overrides: Record<string, unknown> = {}) {
  return {
    displayOrder: 1,
    time: {
      startsAt: '2026-09-01T10:00:00.000Z',
      endsAt: '2026-09-01T12:00:00.000Z',
      timezone: 'Asia/Seoul',
    },
    place: {
      name: 'MeetPoint Cafe',
      address: 'Seoul Jung-gu 1',
      area: 'Jung-gu',
    },
    estimatedCostPerPersonKrw: 15000,
    tags: ['QUIET', 'COFFEE'],
    ...overrides,
  };
}

export function validConditionPayload(overrides: Record<string, unknown> = {}) {
  return {
    availabilityWindows: [
      {
        startsAt: '2026-09-01T09:00:00.000Z',
        endsAt: '2026-09-01T18:00:00.000Z',
      },
    ],
    maxBudgetKrw: null,
    preferences: {
      requiredTags: [],
      preferredTags: [],
      avoidTags: [],
    },
    ...overrides,
  };
}

export function completedScoreResult(id: string, roomId: string) {
  return Object.assign(new ScoreResult(), {
    id,
    roomId,
    status: ScoreResultStatus.COMPLETED,
    clientRequestId: id,
    policyVersion: 'mvp-1',
    scoringProfile: 'MVP_NO_CONDITIONS',
    inputSnapshotHash: 'sha256:test',
    participantCount: 0,
    candidateCount: 0,
    coverage: {
      respondedParticipants: 0,
      totalParticipants: 0,
      submittedResponses: 0,
      expectedResponses: 0,
    },
    recommendationStatus: null,
    recommendationWarnings: [],
    ranking: [],
    candidates: [],
    metadata: {
      scoringProfile: 'MVP_NO_CONDITIONS',
      weights: { time: 40, travelBurden: 25, budget: 20, preference: 15 },
    },
    error: null,
    createdAt: new Date(),
    completedAt: new Date(),
  });
}

export function expectRoomError(response: { body: unknown }, code: string) {
  const messageMatcher = expect.any(String) as unknown;
  const requestIdMatcher = expect.stringMatching(/^req_/) as unknown;
  expect(response.body).toEqual({
    error: {
      code,
      message: messageMatcher,
      details: {},
      requestId: requestIdMatcher,
    },
  });
}

export type RoomsTestContext = {
  app: INestApplication<App>;
  database: MockDatabase;
};

export async function createRoomsTestContext(): Promise<RoomsTestContext> {
  const database = createMockDatabase();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [
      RoomsController,
      CandidateController,
      ParticipantResponseController,
      ParticipantConditionController,
      CalculationController,
      DecisionController,
      ParticipantLifecycleController,
    ],
    providers: [
      CreateRoomUseCase,
      JoinParticipantUseCase,
      CreateCandidateUseCase,
      UpsertParticipantResponseUseCase,
      UpsertParticipantConditionUseCase,
      LeaveRoomUseCase,
      KickParticipantUseCase,
      StartCalculationUseCase,
      ConfirmDecisionUseCase,
      ReopenDecisionUseCase,
      GetRoomQuery,
      GetCalculationQuery,
      GetLatestScoreResultQuery,
      GetDecisionQuery,
      TypeOrmRoomsPersistenceAdapter,
      {
        provide: ROOMS_PERSISTENCE,
        useExisting: TypeOrmRoomsPersistenceAdapter,
      },
      TypeOrmRoomAccessAdapter,
      { provide: ROOM_ACCESS, useExisting: TypeOrmRoomAccessAdapter },
      AccessTokenAdapter,
      { provide: ACCESS_TOKEN, useExisting: AccessTokenAdapter },
      SolverHttpClient,
      SolverAdapter,
      { provide: SOLVER, useExisting: SolverAdapter },
      {
        provide: getDataSourceToken(),
        useValue: database.dataSource,
      },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useLogger(false);
  await app.init();

  return {
    app: app as unknown as INestApplication<App>,
    database,
  };
}

export async function closeRoomsTestContext(
  context: RoomsTestContext
): Promise<void> {
  const { app, database } = context;
  database.rooms.clear();
  database.participants.clear();
  database.candidates.clear();
  database.responses.clear();
  database.decisions.clear();
  database.scoreResults.clear();
  database.conditions.clear();
  await app.close();
}

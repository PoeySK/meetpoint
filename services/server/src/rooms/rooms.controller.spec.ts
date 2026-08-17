import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import { Decision, DecisionStatus } from './entities/decision.entity';
import {
  AvailabilityStatus,
  ParticipantResponse,
  ParticipantResponseStatus,
  TravelBurden,
} from './entities/participant-response.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { ScoreResult, ScoreResultStatus } from './entities/score-result.entity';
import { DecisionService } from './decision.service';
import { DecisionController } from './decision.controller';
import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';
import { CalculationController } from './calculation.controller';
import { RoomCalculationService } from './calculation/room-calculation.service';
import { RoomsController } from './rooms.controller';
import { ParticipantLifecycleController } from './participant-lifecycle.controller';
import { ParticipantLifecycleService } from './participant-lifecycle.service';
import { ParticipantResponseController } from './participant-response.controller';
import { ParticipantResponseService } from './participant-response.service';
import { RoomQueryService } from './room-query.service';
import { RoomService } from './room.service';

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

type MockDatabase = {
  dataSource: DataSource;
  rooms: RoomStore;
  participants: ParticipantStore;
  candidates: CandidateStore;
  responses: ParticipantResponseStore;
  decisions: DecisionStore;
  scoreResults: ScoreResultStore;
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
  failRoomSave: boolean;
  failParticipantSave: boolean;
  failCandidateSave: boolean;
  failResponseSave: boolean;
  failScoreResultSave: boolean;
};

function createMockDatabase(): MockDatabase {
  const rooms: RoomStore = new Map();
  const participants: ParticipantStore = new Map();
  const candidates: CandidateStore = new Map();
  const responses: ParticipantResponseStore = new Map();
  const decisions: DecisionStore = new Map();
  const scoreResults: ScoreResultStore = new Map();
  const state = {
    failRoomSave: false,
    failParticipantSave: false,
    failCandidateSave: false,
    failResponseSave: false,
    failScoreResultSave: false,
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
          new Map(
            [...store].map(([id, value]) => [id, { ...value } as T] as const)
          );
        const roomsBeforeTransaction = cloneStore(rooms);
        const participantsBeforeTransaction = cloneStore(participants);
        const candidatesBeforeTransaction = cloneStore(candidates);
        const responsesBeforeTransaction = cloneStore(responses);
        const decisionsBeforeTransaction = cloneStore(decisions);
        const scoreResultsBeforeTransaction = cloneStore(scoreResults);

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
    scoreResultRepository,
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
  } as MockDatabase;
}

function validPayload(overrides: CreateRoomPayload = {}) {
  return {
    title: overrides.title ?? 'Room test',
    timezone: overrides.timezone ?? 'Asia/Seoul',
    host: {
      displayName: overrides.host?.displayName ?? 'Host test',
    },
  };
}

function validCandidatePayload(overrides: Record<string, unknown> = {}) {
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

function completedScoreResult(id: string, roomId: string) {
  return Object.assign(new ScoreResult(), {
    id,
    roomId,
    status: ScoreResultStatus.COMPLETED,
  });
}

function expectRoomError(response: { body: unknown }, code: string) {
  expect(response.body).toEqual({
    error: {
      code,
      message: expect.any(String),
      details: {},
      requestId: expect.stringMatching(/^req_/),
    },
  });
}

describe('RoomsController', () => {
  let app: INestApplication<App>;
  let database: MockDatabase;

  beforeEach(async () => {
    database = createMockDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        RoomsController,
        CandidateController,
        ParticipantResponseController,
        CalculationController,
        DecisionController,
        ParticipantLifecycleController,
      ],
      providers: [
        RoomService,
        RoomQueryService,
        CandidateService,
        ParticipantResponseService,
        RoomCalculationService,
        DecisionService,
        ParticipantLifecycleService,
        {
          provide: getDataSourceToken(),
          useValue: database.dataSource,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterEach(async () => {
    database.rooms.clear();
    database.participants.clear();
    database.candidates.clear();
    database.responses.clear();
    database.decisions.clear();
    database.scoreResults.clear();
    await app.close();
  });

  it('creates a Room and its HOST Participant', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    expect(response.body.room.status).toBe(RoomStatus.DRAFT);
    expect(response.body.room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.hostParticipant.role).toBe(ParticipantRole.HOST);
    expect(response.body.hostParticipant.status).toBe(ParticipantStatus.JOINED);
    expect(response.body.room.hostParticipantId).toBe(
      response.body.hostParticipant.id
    );
    expect(response.body.access.hostToken).toEqual(expect.any(String));
    expect(response.body.access.hostToken).not.toHaveLength(0);

    const persistedRoom = database.rooms.get(response.body.room.id);
    const persistedParticipant = database.participants.get(
      response.body.hostParticipant.id
    );

    expect(persistedRoom).toBeDefined();
    expect(persistedParticipant).toBeDefined();
    expect(persistedRoom?.hostParticipantId).toBe(persistedParticipant?.id);
  });

  it('returns Room details for a valid HOST token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);

    expect(response.body.room.id).toBe(created.body.room.id);
    expect(response.body.room.status).toBe(RoomStatus.DRAFT);
    expect(response.body.hostParticipant.id).toBe(
      created.body.hostParticipant.id
    );
    expect(response.body.hostParticipant.role).toBe(ParticipantRole.HOST);
    expect(response.body.currentParticipant).toMatchObject({
      id: created.body.hostParticipant.id,
      displayName: 'Host test',
      role: ParticipantRole.HOST,
      status: ParticipantStatus.JOINED,
    });
    expect(response.body.participants).toHaveLength(1);
    expect(response.body.participants[0]).toMatchObject({
      id: created.body.hostParticipant.id,
      displayName: 'Host test',
      role: ParticipantRole.HOST,
      status: ParticipantStatus.JOINED,
    });
    expect(response.body.candidates).toEqual([]);
    expect(response.body.myResponses).toEqual([]);
    expect(response.body.latestScoreResult).toBeNull();
    expect(response.body.decision).toBeNull();
  });

  it('returns only the current participant responses for active Candidates', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const firstParticipant = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'First member' })
      .expect(201);
    const secondParticipant = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Second member' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    const firstSaved = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${firstParticipant.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set(
        'Authorization',
        `Bearer ${firstParticipant.body.access.participantToken}`
      )
      .send({
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        travelBurden: TravelBurden.EASY,
        note: 'First note',
      })
      .expect(200);
    await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${secondParticipant.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set(
        'Authorization',
        `Bearer ${secondParticipant.body.access.participantToken}`
      )
      .send({
        availabilityStatus: AvailabilityStatus.UNAVAILABLE,
        travelBurden: TravelBurden.HARD,
        note: 'Second note',
      })
      .expect(200);

    const firstRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set(
        'Authorization',
        `Bearer ${firstParticipant.body.access.participantToken}`
      )
      .expect(200);
    const secondRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set(
        'Authorization',
        `Bearer ${secondParticipant.body.access.participantToken}`
      )
      .expect(200);
    const hostRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);

    expect(firstRoom.body.myResponses).toEqual([
      expect.objectContaining({
        id: firstSaved.body.response.id,
        participantId: firstParticipant.body.participant.id,
        candidateId: candidate.body.candidate.id,
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        travelBurden: TravelBurden.EASY,
        note: 'First note',
      }),
    ]);
    expect(secondRoom.body.myResponses).toEqual([
      expect.objectContaining({
        participantId: secondParticipant.body.participant.id,
        availabilityStatus: AvailabilityStatus.UNAVAILABLE,
        travelBurden: TravelBurden.HARD,
        note: 'Second note',
      }),
    ]);
    expect(hostRoom.body.myResponses).toEqual([]);
  });

  it('keeps an archived Candidate response in storage but excludes it from myResponses', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const saved = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.MAYBE,
        travelBurden: TravelBurden.NORMAL,
      })
      .expect(200);

    database.candidates.get(candidate.body.candidate.id)!.status =
      CandidateStatus.ARCHIVED;

    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);

    expect(room.body.candidates).toEqual([]);
    expect(room.body.myResponses).toEqual([]);
    expect(database.responses.has(saved.body.response.id)).toBe(true);
  });

  it('creates a MEMBER Participant and allows the MEMBER token to read the Room', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    const joined = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${created.body.room.roomCode.toLowerCase()}/participants`
      )
      .send({ displayName: 'Member test' })
      .expect(201);

    expect(joined.body.room).toEqual({
      id: created.body.room.id,
      roomCode: created.body.room.roomCode,
      status: RoomStatus.OPEN,
    });
    expect(joined.body.participant).toMatchObject({
      displayName: 'Member test',
      role: ParticipantRole.MEMBER,
      status: ParticipantStatus.JOINED,
    });
    expect(joined.body.access.participantToken).toEqual(expect.any(String));

    const persistedParticipant = database.participants.get(
      joined.body.participant.id
    );
    expect(persistedParticipant).toBeDefined();
    expect(persistedParticipant?.role).toBe(ParticipantRole.MEMBER);
    expect(persistedParticipant?.tokenHash).not.toBe(
      joined.body.access.participantToken
    );
    expect(persistedParticipant?.tokenHash).toHaveLength(64);

    const serializedJoinResponse = JSON.stringify(joined.body);
    expect(serializedJoinResponse).not.toContain('tokenHash');
    expect(serializedJoinResponse).not.toContain('tokenExpiresAt');

    const roomResponse = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);

    const serializedRoomResponse = JSON.stringify(roomResponse.body);
    expect(serializedRoomResponse).not.toContain('tokenHash');
    expect(serializedRoomResponse).not.toContain('tokenExpiresAt');
    expect(serializedRoomResponse).not.toContain('tokenRevokedAt');
    expect(serializedRoomResponse).not.toContain(
      joined.body.access.participantToken
    );

    expect(roomResponse.body.hostParticipant.role).toBe(ParticipantRole.HOST);
    expect(roomResponse.body.currentParticipant).toMatchObject({
      id: joined.body.participant.id,
      displayName: 'Member test',
      role: ParticipantRole.MEMBER,
      status: ParticipantStatus.JOINED,
    });
    expect(roomResponse.body.participants).toHaveLength(2);
    expect(roomResponse.body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: joined.body.participant.id,
          displayName: 'Member test',
          role: ParticipantRole.MEMBER,
          status: ParticipantStatus.JOINED,
        }),
      ])
    );
  });

  it.each([
    ['missing displayName', {}],
    ['displayName longer than 30 characters', { displayName: 'm'.repeat(31) }],
  ])(
    'returns 400 for invalid Participant input: %s',
    async (_caseName, payload) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send(payload)
        .expect(400);

      expectRoomError(response, 'VALIDATION_ERROR');
      expect(database.participants.size).toBe(1);
    }
  );

  it('returns 404 for an unknown or invalid Room code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms/NOTFOUND/participants')
      .send({ displayName: 'Member test' })
      .expect(404);

    expectRoomError(response, 'ROOM_NOT_FOUND_OR_INVALID_CODE');
  });

  it('rejects Participant entry when the Room is full', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    for (let index = 1; index < 6; index += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send({ displayName: `Member ${index}` })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Too many' })
      .expect(409);

    expectRoomError(response, 'ROOM_STATE_CONFLICT');
    expect(database.participants.size).toBe(6);
  });

  it.each([RoomStatus.DRAFT, RoomStatus.OPEN])(
    'allows Participant entry when the Room is %s',
    async (status) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);
      const room = database.rooms.get(created.body.room.id);

      expect(room).toBeDefined();
      room!.status = status;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send({ displayName: 'Member test' })
        .expect(201);

      expect(response.body.room.status).toBe(RoomStatus.OPEN);
      expect(response.body.participant.role).toBe(ParticipantRole.MEMBER);
      expect(database.participants.size).toBe(2);
    }
  );

  it('allows a MEMBER to leave, revokes access, stales the latest result, and preserves history', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Leaving member' })
      .expect(201);
    const member = database.participants.get(joined.body.participant.id);
    const response = Object.assign(new ParticipantResponse(), {
      id: 'response-before-leave',
      roomId: created.body.room.id,
      participantId: joined.body.participant.id,
      candidateId: 'candidate-before-leave',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      travelBurden: TravelBurden.EASY,
      note: 'keep this history',
      status: ParticipantResponseStatus.SUBMITTED,
      submittedAt: new Date(),
      updatedAt: new Date(),
    });
    const scoreResult = completedScoreResult(
      'score-before-leave',
      created.body.room.id
    );
    const decision = Object.assign(new Decision(), {
      id: 'decision-before-leave',
      roomId: created.body.room.id,
      scoreResultId: scoreResult.id,
      candidateId: 'candidate-before-leave',
      decidedByParticipantId: created.body.hostParticipant.id,
      status: DecisionStatus.REOPENED,
      acknowledgeIssues: false,
      decisionNote: null,
      confirmedAt: new Date(),
      replacedDecisionId: null,
      reopenedAt: new Date(),
      reopenReason: 'keep this decision history',
    });
    database.responses.set(response.id, response);
    database.scoreResults.set(scoreResult.id, scoreResult);
    database.decisions.set(decision.id, decision);
    database.rooms.get(created.body.room.id)!.status = RoomStatus.CALCULATED;
    database.rooms.get(created.body.room.id)!.latestScoreResultId =
      scoreResult.id;
    database.rooms.get(created.body.room.id)!.currentDecisionId = decision.id;

    const leave = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/leave`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);

    expect(leave.body).toMatchObject({
      participant: {
        id: joined.body.participant.id,
        status: ParticipantStatus.LEFT,
      },
      roomStatus: RoomStatus.OPEN,
      requestId: expect.stringMatching(/^req_/),
    });
    expect(member?.status).toBe(ParticipantStatus.LEFT);
    expect(member?.tokenRevokedAt).toEqual(expect.any(Date));
    expect(database.responses.get(response.id)).toMatchObject({
      participantId: joined.body.participant.id,
      note: 'keep this history',
    });
    expect(database.scoreResults.get(scoreResult.id)?.status).toBe(
      ScoreResultStatus.STALE
    );
    expect(database.rooms.get(created.body.room.id)?.latestScoreResultId).toBe(
      scoreResult.id
    );
    expect(database.rooms.get(created.body.room.id)?.currentDecisionId).toBe(
      decision.id
    );
    expect(database.decisions.get(decision.id)).toMatchObject({
      status: DecisionStatus.REOPENED,
      scoreResultId: scoreResult.id,
    });

    const kickLeft = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/kick`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(409);
    expectRoomError(kickLeft, 'ROOM_STATE_CONFLICT');

    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect((response) => {
        expect(response.status).toBe(401);
        expectRoomError(response, 'TOKEN_EXPIRED');
      });

    const hostRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(hostRoom.body.participants).toHaveLength(1);
    expect(hostRoom.body.participants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: joined.body.participant.id }),
      ])
    );

    const rejoined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Leaving member' })
      .expect(201);
    expect(rejoined.body.participant.id).not.toBe(joined.body.participant.id);

    const rejoinedRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${rejoined.body.access.participantToken}`)
      .expect(200);
    expect(rejoinedRoom.body.myResponses).toEqual([]);
  });

  it('allows HOST to kick an active MEMBER and rejects repeat processing', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Kicked member' })
      .expect(201);
    const member = database.participants.get(joined.body.participant.id);

    const kick = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/kick`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);

    expect(kick.body.participant).toMatchObject({
      id: joined.body.participant.id,
      status: ParticipantStatus.REMOVED,
    });
    expect(member?.status).toBe(ParticipantStatus.REMOVED);
    expect(member?.tokenRevokedAt).toEqual(expect.any(Date));

    const hostRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(hostRoom.body.participants).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect((response) => {
        expect(response.status).toBe(401);
        expectRoomError(response, 'TOKEN_EXPIRED');
      });

    const repeatedKick = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/kick`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(409);
    expectRoomError(repeatedKick, 'ROOM_STATE_CONFLICT');
  });

  it('does not trust a MEMBER participantId body, blocks HOST self-leave, and blocks cross-room kick', async () => {
    const firstRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'First room' }))
      .expect(201);
    const firstMember = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${firstRoom.body.room.roomCode}/participants`)
      .send({ displayName: 'First member' })
      .expect(201);
    const secondRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'Second room' }))
      .expect(201);
    const secondMember = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${secondRoom.body.room.roomCode}/participants`)
      .send({ displayName: 'Second member' })
      .expect(201);

    const memberKick = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${firstRoom.body.room.id}/participants/${firstRoom.body.hostParticipant.id}/kick`
      )
      .set(
        'Authorization',
        `Bearer ${firstMember.body.access.participantToken}`
      )
      .expect(403);
    expectRoomError(memberKick, 'HOST_ONLY');

    const spoofedLeave = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${firstRoom.body.room.id}/leave`)
      .set(
        'Authorization',
        `Bearer ${firstMember.body.access.participantToken}`
      )
      .send({ participantId: firstRoom.body.hostParticipant.id })
      .expect(200);
    expect(spoofedLeave.body.participant.id).toBe(
      firstMember.body.participant.id
    );
    expect(
      database.participants.get(firstRoom.body.hostParticipant.id)?.status
    ).toBe(ParticipantStatus.JOINED);

    const hostSelfLeave = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${firstRoom.body.room.id}/leave`)
      .set('Authorization', `Bearer ${firstRoom.body.access.hostToken}`)
      .expect(409);
    expectRoomError(hostSelfLeave, 'ROOM_STATE_CONFLICT');

    const hostSelfKick = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${firstRoom.body.room.id}/participants/${firstRoom.body.hostParticipant.id}/kick`
      )
      .set('Authorization', `Bearer ${firstRoom.body.access.hostToken}`)
      .expect(409);
    expectRoomError(hostSelfKick, 'ROOM_STATE_CONFLICT');

    const crossRoomKick = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${firstRoom.body.room.id}/participants/${secondMember.body.participant.id}/kick`
      )
      .set('Authorization', `Bearer ${firstRoom.body.access.hostToken}`)
      .expect(404);
    expectRoomError(crossRoomKick, 'RESOURCE_NOT_FOUND');
    expect(
      database.participants.get(secondMember.body.participant.id)?.status
    ).toBe(ParticipantStatus.JOINED);
  });

  it.each([RoomStatus.CALCULATING, RoomStatus.CONFIRMED, RoomStatus.CLOSED])(
    'blocks leave and kick while the Room is %s',
    async (status) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);
      const joined = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send({ displayName: 'State member' })
        .expect(201);
      database.rooms.get(created.body.room.id)!.status = status;

      const leave = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/leave`)
        .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
        .expect(409);
      expectRoomError(leave, 'ROOM_STATE_CONFLICT');

      const kick = await request(app.getHttpServer())
        .post(
          `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/kick`
        )
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .expect(409);
      expectRoomError(kick, 'ROOM_STATE_CONFLICT');
      expect(
        database.participants.get(joined.body.participant.id)?.status
      ).toBe(ParticipantStatus.JOINED);
    }
  );

  it.each([
    ['participant save', 'failParticipantSave'],
    ['score result save', 'failScoreResultSave'],
    ['room save', 'failRoomSave'],
  ] as const)('rolls back leave when %s fails', async (_label, failure) => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Rollback member' })
      .expect(201);
    const scoreResult = completedScoreResult(
      `score-rollback-${failure}`,
      created.body.room.id
    );
    database.scoreResults.set(scoreResult.id, scoreResult);
    const room = database.rooms.get(created.body.room.id)!;
    room.status = RoomStatus.CALCULATED;
    room.latestScoreResultId = scoreResult.id;
    database[failure] = true;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/leave`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(500);
    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.participants.get(joined.body.participant.id)).toMatchObject(
      {
        status: ParticipantStatus.JOINED,
        tokenRevokedAt: null,
      }
    );
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.CALCULATED
    );
    expect(database.scoreResults.get(scoreResult.id)?.status).toBe(
      ScoreResultStatus.COMPLETED
    );
  });

  it('serializes concurrent leave requests so only one changes the Participant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Concurrent member' })
      .expect(201);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/leave`)
        .set('Authorization', `Bearer ${joined.body.access.participantToken}`),
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/leave`)
        .set('Authorization', `Bearer ${joined.body.access.participantToken}`),
    ]);
    const successCount = responses.filter(
      (response) => response.status === 200
    ).length;
    const rejectedCount = responses.filter((response) =>
      [401, 409].includes(response.status)
    ).length;

    expect(successCount).toBe(1);
    expect(rejectedCount).toBe(1);
    expect(database.participants.get(joined.body.participant.id)?.status).toBe(
      ParticipantStatus.LEFT
    );
  });

  it('blocks all Room-scoped APIs after a Participant token is revoked', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Revoked member' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/leave`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);

    const authorization = `Bearer ${joined.body.access.participantToken}`;
    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', authorization);
    const response = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', authorization)
      .send({
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        travelBurden: TravelBurden.EASY,
      });
    const calculation = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/calculations`)
      .set('Authorization', authorization)
      .send({ clientRequestId: 'revoked-calculation' });
    const decision = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}/decision`)
      .set('Authorization', authorization);

    for (const result of [room, response, calculation, decision]) {
      expect(result.status).toBe(401);
      expectRoomError(result, 'TOKEN_EXPIRED');
    }
  });

  it.each([
    RoomStatus.CALCULATING,
    RoomStatus.CALCULATED,
    RoomStatus.CONFIRMED,
    RoomStatus.CLOSED,
  ])('rejects Participant entry when the Room is %s', async (status) => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const room = database.rooms.get(created.body.room.id);

    expect(room).toBeDefined();
    room!.status = status;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(409);

    expectRoomError(response, 'ROOM_STATE_CONFLICT');
    expect(database.participants.size).toBe(1);
  });

  it('returns TOKEN_EXPIRED when a MEMBER token has expired', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);
    const participant = database.participants.get(joined.body.participant.id);

    expect(participant).toBeDefined();
    participant!.tokenExpiresAt = new Date(Date.now() - 1_000);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(401);

    expectRoomError(response, 'TOKEN_EXPIRED');
  });

  it('rolls back a MEMBER Participant and Room status when persistence fails', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    database.failParticipantSave = true;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(500);

    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.DRAFT
    );
    expect(database.participants.size).toBe(1);
  });

  it.each([
    [
      'title missing',
      { timezone: 'Asia/Seoul', host: { displayName: 'Host' } },
    ],
    [
      'title longer than 80 characters',
      validPayload({ title: 't'.repeat(81) }),
    ],
    [
      'displayName missing',
      { title: 'Room', timezone: 'Asia/Seoul', host: {} },
    ],
    [
      'displayName longer than 30 characters',
      validPayload({ host: { displayName: 'h'.repeat(31) } }),
    ],
    ['invalid timezone', validPayload({ timezone: 'Not/A/Timezone' })],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(payload)
      .expect(400);

    expectRoomError(response, 'VALIDATION_ERROR');
    expect(database.rooms.size).toBe(0);
    expect(database.participants.size).toBe(0);
  });

  it('returns 401 for a nonexistent token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', 'Bearer nonexistent-token')
      .expect(401);

    expectRoomError(response, 'INVALID_TOKEN');
  });

  it('returns 404 when a token belongs to another Room', async () => {
    const firstRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'First room' }))
      .expect(201);
    const secondRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'Second room' }))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${firstRoom.body.room.id}`)
      .set('Authorization', `Bearer ${secondRoom.body.access.hostToken}`)
      .expect(404);

    expectRoomError(response, 'RESOURCE_NOT_FOUND');
  });

  it('returns 401 for an expired token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const participant = database.participants.get(
      created.body.hostParticipant.id
    );

    expect(participant).toBeDefined();
    participant!.tokenExpiresAt = new Date(Date.now() - 1_000);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(401);

    expectRoomError(response, 'TOKEN_EXPIRED');
  });

  it('does not expose private token fields in the GET response', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    const serializedResponse = JSON.stringify(response.body);

    expect(serializedResponse).not.toContain('tokenHash');
    expect(serializedResponse).not.toContain('tokenExpiresAt');
    expect(serializedResponse).not.toContain('tokenRevokedAt');
    expect(serializedResponse).not.toContain(created.body.access.hostToken);
  });

  it('rolls back the Room when HOST Participant persistence fails', async () => {
    database.failParticipantSave = true;

    await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(500);

    expect(database.roomRepository.save).toHaveBeenCalled();
    expect(database.participantRepository.save).toHaveBeenCalled();
    expect(database.rooms.size).toBe(0);
    expect(database.participants.size).toBe(0);
  });

  it('allows the HOST to create a Candidate and returns it from Room details', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidatePayload = validCandidatePayload();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(candidatePayload)
      .expect(201);

    expect(response.body.candidate).toMatchObject({
      roomId: created.body.room.id,
      displayOrder: 1,
      status: CandidateStatus.ACTIVE,
      time: candidatePayload.time,
      place: candidatePayload.place,
      estimatedCostPerPersonKrw: 15000,
      tags: ['QUIET', 'COFFEE'],
      version: 1,
      archivedAt: null,
    });
    expect(database.candidates.size).toBe(1);
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.OPEN
    );

    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);

    expect(room.body.candidates).toHaveLength(1);
    expect(room.body.candidates[0].id).toBe(response.body.candidate.id);
  });

  it('rejects Candidate creation for a MEMBER token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(validCandidatePayload())
      .expect(403);

    expectRoomError(response, 'HOST_ONLY');
    expect(database.candidates.size).toBe(0);
  });

  it.each([
    ['missing displayOrder', { displayOrder: undefined }],
    [
      'invalid time range',
      {
        time: {
          startsAt: '2026-09-01T12:00:00.000Z',
          endsAt: '2026-09-01T10:00:00.000Z',
          timezone: 'Asia/Seoul',
        },
      },
    ],
    [
      'invalid timezone',
      {
        time: {
          startsAt: '2026-09-01T10:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
          timezone: 'Not/A/Timezone',
        },
      },
    ],
    ['place name missing', { place: { address: 'Seoul', area: 'Jung-gu' } }],
    ['cost is not an integer', { estimatedCostPerPersonKrw: 1.5 }],
    ['too many tags', { tags: Array.from({ length: 11 }, () => 'TAG') }],
  ])(
    'returns 400 for invalid Candidate input: %s',
    async (_caseName, overrides) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send(validCandidatePayload(overrides))
        .expect(400);

      expectRoomError(response, 'VALIDATION_ERROR');
      expect(database.candidates.size).toBe(0);
    }
  );

  it('rejects duplicate Candidates and more than five active Candidates', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(
        validCandidatePayload({
          displayOrder: 6,
        })
      )
      .expect(409);

    expectRoomError(duplicate, 'ROOM_STATE_CONFLICT');

    for (let index = 2; index <= 5; index += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send(
          validCandidatePayload({
            displayOrder: index,
            time: {
              startsAt: `2026-09-${String(index).padStart(2, '0')}T10:00:00.000Z`,
              endsAt: `2026-09-${String(index).padStart(2, '0')}T12:00:00.000Z`,
              timezone: 'Asia/Seoul',
            },
            place: {
              name: `MeetPoint Cafe ${index}`,
              address: `Seoul Jung-gu ${index}`,
              area: 'Jung-gu',
            },
          })
        )
        .expect(201);
    }

    const overflow = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(
        validCandidatePayload({
          displayOrder: 6,
          time: {
            startsAt: '2026-10-01T10:00:00.000Z',
            endsAt: '2026-10-01T12:00:00.000Z',
            timezone: 'Asia/Seoul',
          },
          place: {
            name: 'Another Cafe',
            address: 'Seoul Mapo-gu 1',
            area: 'Mapo-gu',
          },
        })
      )
      .expect(422);

    expectRoomError(overflow, 'CANDIDATE_LIMIT_EXCEEDED');
    expect(database.candidates.size).toBe(5);
  });

  it.each([RoomStatus.CONFIRMED, RoomStatus.CLOSED])(
    'rejects Candidate creation when the Room is %s',
    async (status) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);
      database.rooms.get(created.body.room.id)!.status = status;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send(validCandidatePayload())
        .expect(409);

      expectRoomError(response, 'ROOM_STATE_CONFLICT');
      expect(database.candidates.size).toBe(0);
    }
  );

  it('reopens a CALCULATED Room when the HOST adds a Candidate', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    database.rooms.get(created.body.room.id)!.status = RoomStatus.CALCULATED;

    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.OPEN
    );
  });

  it('rolls back the Room status when Candidate persistence fails', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    database.failCandidateSave = true;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(500);

    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.DRAFT
    );
    expect(database.candidates.size).toBe(0);
  });

  it('creates and updates one ParticipantResponse per participant and Candidate', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    database.rooms.get(created.body.room.id)!.status = RoomStatus.CALCULATED;

    const first = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        travelBurden: TravelBurden.EASY,
        note: 'Near the station',
      })
      .expect(200);

    expect(first.body.response).toMatchObject({
      participantId: joined.body.participant.id,
      candidateId: candidate.body.candidate.id,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      travelBurden: TravelBurden.EASY,
      note: 'Near the station',
      status: ParticipantResponseStatus.SUBMITTED,
    });
    expect(first.body.participantStatus).toBe(ParticipantStatus.JOINED);
    expect(first.body.scoreResultStatus).toBe('STALE');
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.OPEN
    );
    expect(database.responses.size).toBe(1);

    const second = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.MAYBE,
        travelBurden: TravelBurden.HARD,
        note: 'Updated note',
      })
      .expect(200);

    expect(second.body.response.id).toBe(first.body.response.id);
    expect(second.body.response).toMatchObject({
      availabilityStatus: AvailabilityStatus.MAYBE,
      travelBurden: TravelBurden.HARD,
      note: 'Updated note',
    });
    expect(database.responses.size).toBe(1);
  });

  it('enforces ParticipantResponse token, input, candidate, and Room state rules', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const path = `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`;
    const validResponse = {
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      travelBurden: TravelBurden.NORMAL,
    };

    const wrongParticipant = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${created.body.hostParticipant?.id ?? created.body.room.hostParticipantId}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(validResponse)
      .expect(403);
    expectRoomError(wrongParticipant, 'FORBIDDEN');

    const invalid = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({ availabilityStatus: 'UNKNOWN', travelBurden: 'EASY' })
      .expect(400);
    expectRoomError(invalid, 'VALIDATION_ERROR');

    const longNote = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        ...validResponse,
        note: 'n'.repeat(301),
      })
      .expect(400);
    expectRoomError(longNote, 'VALIDATION_ERROR');

    const archivedCandidate = database.candidates.get(
      candidate.body.candidate.id
    );
    expect(archivedCandidate).toBeDefined();
    archivedCandidate!.status = CandidateStatus.ARCHIVED;

    const archived = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(validResponse)
      .expect(409);
    expectRoomError(archived, 'ROOM_STATE_CONFLICT');

    archivedCandidate!.status = CandidateStatus.ACTIVE;
    database.rooms.get(created.body.room.id)!.status = RoomStatus.CONFIRMED;

    const confirmed = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(validResponse)
      .expect(409);
    expectRoomError(confirmed, 'ROOM_STATE_CONFLICT');
  });

  it('rolls back a ParticipantResponse when persistence fails', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    database.failResponseSave = true;

    const response = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.UNAVAILABLE,
        travelBurden: TravelBurden.HARD,
      })
      .expect(500);

    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.responses.size).toBe(0);
  });
});

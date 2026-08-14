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
import { Room, RoomStatus } from './entities/room.entity';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

type CreateRoomPayload = {
  title?: unknown;
  timezone?: unknown;
  host?: {
    displayName?: unknown;
  };
};

type RoomStore = Map<string, Room>;
type ParticipantStore = Map<string, Participant>;

type MockDatabase = {
  dataSource: DataSource;
  rooms: RoomStore;
  participants: ParticipantStore;
  roomRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  participantRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  failParticipantSave: boolean;
};

function createMockDatabase(): MockDatabase {
  const rooms: RoomStore = new Map();
  const participants: ParticipantStore = new Map();
  const state = { failParticipantSave: false };

  const roomRepository = {
    create: jest.fn((attributes: Partial<Room>) => ({
      ...attributes,
      createdAt: attributes.createdAt ?? new Date(),
      updatedAt: attributes.updatedAt ?? new Date(),
    })),
    save: jest.fn(async (room: Room) => {
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
    findOneBy: jest.fn(async (criteria: Partial<Room>) => {
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
    save: jest.fn(async (participant: Participant) => {
      if (state.failParticipantSave) {
        throw new Error('participant save failed');
      }

      participants.set(participant.id, participant);
      return participant;
    }),
    findOneBy: jest.fn(async (criteria: Partial<Participant>) => {
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
    find: jest.fn(async (options: { where?: { roomId?: string } }) => {
      const roomId = options.where?.roomId;

      return [...participants.values()]
        .filter((participant) => participant.roomId === roomId)
        .sort(
          (left, right) => left.joinedAt.getTime() - right.joinedAt.getTime()
        );
    }),
  };

  const manager = {
    getRepository: jest.fn((entity: typeof Room | typeof Participant) =>
      entity === Room ? roomRepository : participantRepository
    ),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(
      async (
        callback: (transactionManager: EntityManager) => Promise<unknown>
      ) => {
        const roomsBeforeTransaction = new Map(rooms);
        const participantsBeforeTransaction = new Map(participants);

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

          throw error;
        }
      }
    ),
    getRepository: jest.fn((entity: typeof Room | typeof Participant) =>
      entity === Room ? roomRepository : participantRepository
    ),
  } as unknown as DataSource;

  return {
    dataSource,
    rooms,
    participants,
    roomRepository,
    participantRepository,
    get failParticipantSave() {
      return state.failParticipantSave;
    },
    set failParticipantSave(value: boolean) {
      state.failParticipantSave = value;
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

describe('RoomsController', () => {
  let app: INestApplication<App>;
  let database: MockDatabase;

  beforeEach(async () => {
    database = createMockDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        RoomsService,
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
    expect(response.body.participants).toHaveLength(1);
    expect(response.body.participants[0]).toMatchObject({
      id: created.body.hostParticipant.id,
      role: ParticipantRole.HOST,
      status: ParticipantStatus.JOINED,
    });
    expect(response.body.candidates).toEqual([]);
    expect(response.body.latestScoreResult).toBeNull();
    expect(response.body.decision).toBeNull();
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
    expect(roomResponse.body.participants).toHaveLength(2);
    expect(roomResponse.body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: joined.body.participant.id,
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

      expect(response.body.message).toBe('VALIDATION_ERROR');
      expect(database.participants.size).toBe(1);
    }
  );

  it('returns 404 for an unknown or invalid Room code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms/NOTFOUND/participants')
      .send({ displayName: 'Member test' })
      .expect(404);

    expect(response.body.message).toBe('ROOM_NOT_FOUND_OR_INVALID_CODE');
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

    expect(response.body.message).toBe('ROOM_STATE_CONFLICT');
    expect(database.participants.size).toBe(6);
  });

  it.each([RoomStatus.CONFIRMED, RoomStatus.CLOSED])(
    'rejects Participant entry when the Room is %s',
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
        .expect(409);

      expect(response.body.message).toBe('ROOM_STATE_CONFLICT');
      expect(database.participants.size).toBe(1);
    }
  );

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

    expect(response.body.message).toBe('TOKEN_EXPIRED');
  });

  it('rolls back a MEMBER Participant and Room status when persistence fails', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    database.failParticipantSave = true;

    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Member test' })
      .expect(500);

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

    expect(response.body.message).toBe('VALIDATION_ERROR');
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

    expect(response.body.message).toBe('INVALID_TOKEN');
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

    expect(response.body.message).toBe('RESOURCE_NOT_FOUND');
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

    expect(response.body.message).toBe('TOKEN_EXPIRED');
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
});

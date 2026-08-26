import request from 'supertest';
import {
  closeRoomsTestContext,
  createRoomsTestContext,
  expectRoomError,
  validCandidatePayload,
  validConditionPayload,
  validPayload,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../../domain/participant/participant';
import { CandidateStatus } from '../../../domain/candidate/candidate';
import {
  AvailabilityStatus,
  TravelBurden,
} from '../../../domain/participant-response/participant-response';
import { RoomStatus } from '../../../domain/room/room-status';

describe('Rooms HTTP contract', () => {
  let app: RoomsTestContext['app'];
  let database: RoomsTestContext['database'];

  beforeEach(async () => {
    ({ app, database } = await createRoomsTestContext());
  });

  afterEach(async () => {
    await closeRoomsTestContext({ app, database });
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

    for (const participant of [firstParticipant, secondParticipant]) {
      await request(app.getHttpServer())
        .put(
          `/api/v1/rooms/${created.body.room.id}/participants/${participant.body.participant.id}/conditions`
        )
        .set(
          'Authorization',
          `Bearer ${participant.body.access.participantToken}`
        )
        .send(validConditionPayload())
        .expect(200);
    }

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
    await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/conditions`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(200);
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

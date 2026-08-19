import request from 'supertest';
import {
  closeRoomsTestContext,
  completedScoreResult,
  createRoomsTestContext,
  expectRoomError,
  validCandidatePayload,
  validPayload,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import { ParticipantStatus } from '../../../domain/participant/participant';
import { DecisionStatus } from '../../../domain/decision/decision';
import {
  AvailabilityStatus,
  ParticipantResponseStatus,
  TravelBurden,
} from '../../../domain/participant-response/participant-response';
import { ParticipantResponse } from '../../../infrastructure/persistence/typeorm/entities/participant-response.entity';
import { Decision } from '../../../infrastructure/persistence/typeorm/entities/decision.entity';
import { RoomStatus } from '../../../domain/room/room-status';
import { ScoreResultStatus } from '../../../domain/calculation/score-result';

describe('Participant lifecycle HTTP contract', () => {
  let app: RoomsTestContext['app'];
  let database: RoomsTestContext['database'];

  beforeEach(async () => {
    ({ app, database } = await createRoomsTestContext());
  });

  afterEach(async () => {
    await closeRoomsTestContext({ app, database });
  });

  it('allows a MEMBER to leave, revokes access, stales the latest result, and preserves history', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Leaving member' })
      .expect(201);
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
    expect(database.participants.get(joined.body.participant.id)?.status).toBe(
      ParticipantStatus.LEFT
    );
    expect(
      database.participants.get(joined.body.participant.id)?.tokenRevokedAt
    ).toEqual(expect.any(Date));
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
    expect(database.participants.get(joined.body.participant.id)?.status).toBe(
      ParticipantStatus.REMOVED
    );
    expect(
      database.participants.get(joined.body.participant.id)?.tokenRevokedAt
    ).toEqual(expect.any(Date));

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
});

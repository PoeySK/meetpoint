import request from 'supertest';
import {
  createRoomsTestContext,
  closeRoomsTestContext,
  validPayload,
  validCandidatePayload,
  validConditionPayload,
  expectRoomError,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import { ParticipantStatus } from '../../../domain/participant/participant';
import { RoomStatus } from '../../../domain/room/room-status';

describe('Existing participant recovery HTTP contract', () => {
  let context: RoomsTestContext;
  beforeEach(async () => {
    context = await createRoomsTestContext();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await closeRoomsTestContext(context);
  });
  const origin = 'http://localhost:10081';
  const create = () =>
    request(context.app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
  const recover = (roomId: string, code: unknown) =>
    request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .set('Origin', origin)
      .send({ recoveryCode: code });

  it.each([ParticipantStatus.LEFT, ParticipantStatus.REMOVED])(
    'rejects inactive %s even if legacy credentials remain',
    async (status) => {
      const created = await create();
      const participant = context.database.participants.get(
        created.body.hostParticipant.id
      )!;
      participant.status = status;
      participant.tokenRevokedAt = null;
      await recover(created.body.room.id, created.body.recovery.code).expect(
        401
      );
      expect(context.database.participants.get(participant.id)!.status).toBe(
        status
      );
    }
  );

  it('sets Secure cookies in production and never stores the recovery plaintext in the participant row', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const created = await create();
      const cookieHeader = created.headers['set-cookie'][0];
      expect(cookieHeader.includes('; Secure')).toBe(true);
      expect(cookieHeader.includes('Domain=')).toBe(false);
      const participant = context.database.participants.get(
        created.body.hostParticipant.id
      )!;
      expect(
        JSON.stringify(participant).includes(created.body.recovery.code)
      ).toBe(false);
      expect(participant.recoveryHash?.length).toBe(64);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it.each([
    RoomStatus.DRAFT,
    RoomStatus.OPEN,
    RoomStatus.CALCULATING,
    RoomStatus.CALCULATED,
    RoomStatus.CONFIRMED,
    RoomStatus.CLOSED,
  ])(
    'recovers an expired HOST without changing room or participants in %s',
    async (status) => {
      const created = await create();
      const { room, hostParticipant, recovery, access } = created.body;
      const persistedRoom = context.database.rooms.get(room.id)!;
      persistedRoom.status = status;
      persistedRoom.latestScoreResultId = 'existing-score';
      persistedRoom.currentDecisionId = 'existing-decision';
      const before = structuredClone(persistedRoom);
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
      const expired = await request(context.app.getHttpServer())
        .get(`/api/v1/rooms/${room.id}`)
        .set('Authorization', `Bearer ${access.hostToken}`)
        .expect(401);
      expectRoomError(expired, 'TOKEN_EXPIRED');
      const result = await recover(room.id, recovery.code).expect(201);
      expect(result.body.participant).toMatchObject({
        id: hostParticipant.id,
        role: 'HOST',
      });
      expect(context.database.participants.size).toBe(1);
      expect(context.database.rooms.get(room.id)).toEqual(before);
      await request(context.app.getHttpServer())
        .get(`/api/v1/rooms/${room.id}`)
        .set('Authorization', `Bearer ${result.body.access.participantToken}`)
        .expect(200);
      clock.mockRestore();
      await request(context.app.getHttpServer())
        .get(`/api/v1/rooms/${room.id}`)
        .set('Authorization', `Bearer ${access.hostToken}`)
        .expect(401);
      if (
        [
          RoomStatus.CALCULATING,
          RoomStatus.CONFIRMED,
          RoomStatus.CLOSED,
        ].includes(status)
      ) {
        await request(context.app.getHttpServer())
          .post(`/api/v1/rooms/${room.id}/candidates`)
          .set('Authorization', `Bearer ${result.body.access.participantToken}`)
          .send(validCandidatePayload())
          .expect(409);
      }
    }
  );

  it('keeps MEMBER conditions and responses; recovers solely the credential owner', async () => {
    const created = await create();
    const roomId = created.body.room.id;
    const member = await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Recovery member' })
      .expect(201);
    const candidate = await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const participantId = member.body.participant.id;
    await request(context.app.getHttpServer())
      .put(`/api/v1/rooms/${roomId}/participants/${participantId}/conditions`)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(200);
    const responsePath = `/api/v1/rooms/${roomId}/participants/${participantId}/responses/${candidate.body.candidate.id}`;
    await request(context.app.getHttpServer())
      .put(responsePath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send({
        availabilityStatus: 'AVAILABLE',
        travelBurden: 'EASY',
        note: 'Preserved',
      })
      .expect(200);
    const conditions = structuredClone(context.database.conditions);
    const responses = structuredClone(context.database.responses);
    context.database.rooms.get(roomId)!.status = RoomStatus.CONFIRMED;
    const result = await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .send({
        recoveryCode: member.body.recovery.code,
        participantId: created.body.hostParticipant.id,
        role: 'HOST',
      })
      .expect(201);
    expect(result.body.participant).toMatchObject({
      id: participantId,
      role: 'MEMBER',
      status: 'RESPONDED',
    });
    expect(context.database.conditions).toEqual(conditions);
    expect(context.database.responses).toEqual(responses);
    expect(context.database.participants.size).toBe(2);
    const details = await request(context.app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${result.body.access.participantToken}`)
      .expect(200);
    expect(details.body.myResponses[0].note).toBe('Preserved');
    expect(details.body.myCondition).not.toBeNull();
    await request(context.app.getHttpServer())
      .put(responsePath)
      .set('Authorization', `Bearer ${result.body.access.participantToken}`)
      .send({ availabilityStatus: 'MAYBE', travelBurden: 'HARD' })
      .expect(409);
    await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${result.body.access.participantToken}`)
      .send(validCandidatePayload())
      .expect(403);
  });

  it('rejects public identifiers, wrong rooms, expired and revoked credentials without leaking secrets', async () => {
    const created = await create();
    const other = await create();
    const roomId = created.body.room.id;
    for (const code of [
      undefined,
      created.body.room.roomCode,
      created.body.hostParticipant.id,
      'A'.repeat(43),
    ]) {
      const result = await recover(roomId, code).expect(401);
      expectRoomError(result, 'RECOVERY_UNAVAILABLE');
      expect(
        JSON.stringify(result.body).includes(created.body.recovery.code)
      ).toBe(false);
    }
    await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .set('Origin', origin)
      .send({
        participantId: created.body.hostParticipant.id,
        displayName: 'Host test',
        roomCode: created.body.room.roomCode,
      })
      .expect(401);
    await recover(other.body.room.id, created.body.recovery.code).expect(401);
    const participant = context.database.participants.get(
      created.body.hostParticipant.id
    )!;
    const hash = participant.recoveryHash;
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(participant.recoveryExpiresAt!.getTime());
    await recover(roomId, created.body.recovery.code).expect(401);
    jest.restoreAllMocks();
    context.database.participants.get(
      created.body.hostParticipant.id
    )!.tokenRevokedAt = new Date();
    await recover(roomId, created.body.recovery.code).expect(401);
    context.database.participants.get(
      created.body.hostParticipant.id
    )!.tokenRevokedAt = null;
    const details = await request(context.app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(
      JSON.stringify(details.body).includes(created.body.recovery.code)
    ).toBe(false);
    expect(JSON.stringify(details.body).includes(hash!)).toBe(false);
    expect(Object.hasOwn(created.body.hostParticipant, 'recoveryHash')).toBe(
      false
    );
  });

  it.each(['leave', 'kick'])(
    'permanently refuses %s participants and clears their recovery hash',
    async (action) => {
      const created = await create();
      const member = await request(context.app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send({ displayName: 'Leaving member' })
        .expect(201);
      const roomId = created.body.room.id;
      await request(context.app.getHttpServer())
        .post(
          action === 'leave'
            ? `/api/v1/rooms/${roomId}/leave`
            : `/api/v1/rooms/${roomId}/participants/${member.body.participant.id}/kick`
        )
        .set(
          'Authorization',
          `Bearer ${action === 'leave' ? member.body.access.participantToken : created.body.access.hostToken}`
        )
        .expect(200);
      const participant = context.database.participants.get(
        member.body.participant.id
      )!;
      expect(participant.recoveryHash).toBeNull();
      expect(participant.status).toBe(
        action === 'leave' ? ParticipantStatus.LEFT : ParticipantStatus.REMOVED
      );
      await recover(roomId, member.body.recovery.code).expect(401);
    }
  );

  it('serializes recovery, permits code reuse and keeps only the final issued access token', async () => {
    const created = await create();
    const roomId = created.body.room.id;
    const results = await Promise.all([
      recover(roomId, created.body.recovery.code).expect(201),
      recover(roomId, created.body.recovery.code).expect(201),
    ]);
    const statuses = await Promise.all(
      results.map((result) =>
        request(context.app.getHttpServer())
          .get(`/api/v1/rooms/${roomId}`)
          .set('Authorization', `Bearer ${result.body.access.participantToken}`)
          .then((response) => response.status)
      )
    );
    expect(statuses.sort()).toEqual([200, 401]);
    await recover(roomId, created.body.recovery.code).expect(201);
    expect(context.database.participants.size).toBe(1);
  });

  it('rolls back failed token replacement and credential registration', async () => {
    const created = await create();
    const roomId = created.body.room.id;
    const before = JSON.stringify([...context.database.participants]);
    context.database.failParticipantSave = true;
    await recover(roomId, created.body.recovery.code).expect(500);
    await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery/register`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send({ replace: true })
      .expect(500);
    expect(JSON.stringify([...context.database.participants]) === before).toBe(
      true
    );
    context.database.failParticipantSave = false;
    await request(context.app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    await recover(roomId, created.body.recovery.code).expect(201);
  });

  it('registers legacy active participants, never silently rotates, and explicitly replaces lost codes', async () => {
    const created = await create();
    const roomId = created.body.room.id;
    const participant = context.database.participants.get(
      created.body.hostParticipant.id
    )!;
    participant.recoveryHash = null;
    participant.recoveryExpiresAt = null;
    const register = (replace = false) =>
      request(context.app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/recovery/register`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send({ replace });
    const registered = await register().expect(201);
    expect(registered.body.recovery.code).toEqual(expect.any(String));
    expect((await register().expect(201)).body.recovery.code).toBeNull();
    const replaced = await register(true).expect(201);
    await recover(roomId, registered.body.recovery.code).expect(401);
    await recover(roomId, replaced.body.recovery.code).expect(201);
    await register(true).expect(401);
  });

  it('uses a persistent HttpOnly cookie with origin checks and fixed expiry', async () => {
    const created = await create();
    const roomId = created.body.room.id;
    const cookieHeader = created.headers['set-cookie'][0];
    for (const attribute of [
      'HttpOnly',
      'SameSite=Strict',
      `Path=/api/v1/rooms/${roomId}/recovery`,
      'Expires=',
    ])
      expect(cookieHeader.includes(attribute)).toBe(true);
    const cookie = cookieHeader.split(';')[0];
    await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .set('Cookie', cookie)
      .send({})
      .expect(403);
    await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.example')
      .send({})
      .expect(403);
    const recovered = await request(context.app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({})
      .expect(201);
    expect(recovered.body.participant.id).toBe(created.body.hostParticipant.id);
    expect(recovered.headers['cache-control']).toBe('no-store');
    expect(recovered.body.recoveryExpiresAt).toBe(
      created.body.recovery.expiresAt
    );
    expect(recovered.body).not.toHaveProperty('recoveryCode');
  });
});

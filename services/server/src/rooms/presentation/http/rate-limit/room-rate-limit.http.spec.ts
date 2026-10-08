import request from 'supertest';
import { trustedProxy } from '../../../../config/trusted-proxy';
import {
  createRoomsTestContext,
  closeRoomsTestContext,
  validPayload,
  validConditionPayload,
  validCandidatePayload,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import { CalculationJobRunner } from '../../../application/calculation-job.runner';
import { RoomRateLimiter, ROOM_LIMITS } from './room-rate-limiter';

describe('rate limit HTTP contract and mutation boundaries', () => {
  let context: RoomsTestContext;
  let now: jest.SpyInstance;
  beforeEach(async () => {
    context = await createRoomsTestContext();
    now = jest.spyOn(Date, 'now').mockReturnValue(2000000);
  });
  afterEach(async () => {
    now.mockRestore();
    await closeRoomsTestContext(context);
  });

  it('counts invalid creation, ignores forged forwarding headers, preserves DB and releases with time', async () => {
    const api = context.app.getHttpServer();
    for (let i = 0; i < 10; i++)
      await request(api)
        .post('/api/v1/rooms')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({})
        .expect(400);
    const rejected = await request(api)
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(429);
    expect(rejected.headers['retry-after']).toBe('600');
    expect(rejected.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: expect.any(String),
        details: { retryAfterSeconds: 600 },
        requestId: expect.stringMatching(/^req_/),
      },
    });
    expect(context.database.rooms.size).toBe(0);
    now.mockReturnValue(2600000);
    await request(api).post('/api/v1/rooms').send(validPayload()).expect(201);
  });

  it('trusts only the configured immediate proxy, uses rightmost client address and separates IPs', async () => {
    context.app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', trustedProxy('127.0.0.1'));
    const api = context.app.getHttpServer();
    for (let i = 0; i < 10; i++)
      await request(api)
        .post('/api/v1/rooms')
        .set('X-Forwarded-For', `198.51.100.${i}, 192.0.2.1`)
        .send({})
        .expect(400);
    await request(api)
      .post('/api/v1/rooms')
      .set('X-Forwarded-For', '192.0.2.1')
      .send({})
      .expect(429);
    await request(api)
      .post('/api/v1/rooms')
      .set('X-Forwarded-For', '192.0.2.2')
      .send({})
      .expect(400);
  });

  it('does not let rotated room codes, names, recovery codes or room IDs create fresh quotas', async () => {
    const api = context.app.getHttpServer();
    for (let i = 0; i < 30; i++)
      await request(api)
        .post(`/api/v1/rooms/BAD${i}/participants`)
        .send({ displayName: `Name ${i}` });
    await request(api)
      .post('/api/v1/rooms/AAAAAA/participants')
      .send({ displayName: 'Another' })
      .expect(429);
    for (let i = 0; i < 30; i++)
      await request(api)
        .post(`/api/v1/rooms/invalid-${i}/recovery`)
        .send({ recoveryCode: `code-${i}` });
    await request(api)
      .post('/api/v1/rooms/any/recovery/register')
      .send({})
      .expect(429);
    // Only one IP bucket for each unauthenticated policy, independent of body/path values.
    expect(context.app.get(RoomRateLimiter)['buckets'].size).toBe(2);
  });

  it('limits verified actors across IP changes without changing conditions, auth or polling', async () => {
    const api = context.app.getHttpServer();
    const created = (
      await request(api).post('/api/v1/rooms').send(validPayload()).expect(201)
    ).body;
    const member = (
      await request(api)
        .post(`/api/v1/rooms/${created.room.roomCode}/participants`)
        .send({ displayName: 'Member' })
        .expect(201)
    ).body;
    const path = `/api/v1/rooms/${created.room.id}/participants/${created.hostParticipant.id}/conditions`;
    context.app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', trustedProxy('127.0.0.1'));
    for (let i = 0; i < 10; i++)
      await request(api)
        .put(path)
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .auth(created.access.hostToken, { type: 'bearer' })
        .send(validConditionPayload())
        .expect(200);
    const before = JSON.stringify([...context.database.conditions.values()]);
    await request(api)
      .put(path)
      .auth(created.access.hostToken, { type: 'bearer' })
      .send(validConditionPayload({ maxBudgetKrw: 999 }))
      .expect(429);
    expect(JSON.stringify([...context.database.conditions.values()])).toBe(
      before
    );
    await request(api)
      .put(
        `/api/v1/rooms/${created.room.id}/participants/${member.participant.id}/conditions`
      )
      .auth(member.access.participantToken, { type: 'bearer' })
      .send(validConditionPayload())
      .expect(200);
    for (let i = 0; i < 15; i++)
      await request(api)
        .get(`/api/v1/rooms/${created.room.id}`)
        .auth(created.access.hostToken, { type: 'bearer' })
        .expect(200);
    now.mockReturnValue(2060000);
    await request(api)
      .put(path)
      .auth(created.access.hostToken, { type: 'bearer' })
      .send(validConditionPayload())
      .expect(200);
  });

  it('does not let invalid tokens or forged participant IDs allocate actor entries', async () => {
    const api = context.app.getHttpServer();
    const created = (
      await request(api).post('/api/v1/rooms').send(validPayload()).expect(201)
    ).body;
    const limiter = context.app.get(RoomRateLimiter);
    for (let i = 0; i < 180; i++)
      await request(api)
        .put(
          `/api/v1/rooms/${created.room.id}/participants/fake-${i}/${i % 2 === 0 ? 'conditions' : 'responses/fake-candidate'}`
        )
        .auth(`invalid-${i}`, { type: 'bearer' })
        .send({ participantId: `fake-${i}` })
        .expect(401);
    await request(api)
      .put(
        `/api/v1/rooms/${created.room.id}/participants/${created.hostParticipant.id}/conditions`
      )
      .auth(created.access.hostToken, { type: 'bearer' })
      .send(validConditionPayload())
      .expect(429);
    expect(limiter['buckets'].size).toBe(2);
    expect(context.database.conditions.size).toBe(0);
  });

  it('checks HOST permission before room quota and blocks job creation before use-case', async () => {
    const api = context.app.getHttpServer();
    const created = (
      await request(api).post('/api/v1/rooms').send(validPayload()).expect(201)
    ).body;
    const member = (
      await request(api)
        .post(`/api/v1/rooms/${created.room.roomCode}/participants`)
        .send({ displayName: 'Member' })
    ).body;
    const route = `/api/v1/rooms/${created.room.id}/calculations`;
    await request(api)
      .post(route)
      .auth(member.access.participantToken, { type: 'bearer' })
      .send({ clientRequestId: 'one' })
      .expect(403);
    for (let i = 0; i < 6; i++)
      await request(api)
        .post(route)
        .auth(created.access.hostToken, { type: 'bearer' })
        .send({ clientRequestId: `id-${i}` })
        .expect(422);
    await request(api)
      .post(route)
      .auth(created.access.hostToken, { type: 'bearer' })
      .send({ clientRequestId: 'seven' })
      .expect(429);
    expect(context.database.scoreResults.size).toBe(0);

    const runner = context.app.get(CalculationJobRunner) as unknown as {
      trigger: jest.Mock;
    };
    expect(runner.trigger).not.toHaveBeenCalled();
  });

  it('shares response quota across candidate IDs and recovery registration quota across tokens', async () => {
    const api = context.app.getHttpServer();
    const created = (
      await request(api).post('/api/v1/rooms').send(validPayload())
    ).body;
    const token = created.access.hostToken;
    const prefix = `/api/v1/rooms/${created.room.id}`;
    const candidate = (
      await request(api)
        .post(`${prefix}/candidates`)
        .auth(token, { type: 'bearer' })
        .send(validCandidatePayload())
    ).body.candidate;
    for (let i = 0; i < 30; i++)
      await request(api)
        .put(
          `${prefix}/participants/${created.hostParticipant.id}/responses/${candidate.id}`
        )
        .auth(token, { type: 'bearer' })
        .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
        .expect(200);
    const before = JSON.stringify([...context.database.responses.values()]);
    await request(api)
      .put(
        `${prefix}/participants/${created.hostParticipant.id}/responses/another`
      )
      .auth(token, { type: 'bearer' })
      .send({ availabilityStatus: 'UNAVAILABLE', travelBurden: 'HARD' })
      .expect(429);
    expect(JSON.stringify([...context.database.responses.values()])).toBe(
      before
    );
    let recoveryCode = created.recovery.code as string;
    for (let i = 0; i < 6; i++) {
      const registered = await request(api)
        .post(`${prefix}/recovery/register`)
        .auth(token, { type: 'bearer' })
        .send({ replace: true })
        .expect(201);
      recoveryCode = registered.body.recovery.code as string;
    }
    const recovered = await request(api)
      .post(`${prefix}/recovery`)
      .send({ recoveryCode })
      .expect(201);
    const participantBefore = JSON.stringify([
      ...context.database.participants.values(),
    ]);
    await request(api)
      .post(`${prefix}/recovery/register`)
      .auth(recovered.body.access.participantToken, { type: 'bearer' })
      .send({ replace: true })
      .expect(429);
    expect(JSON.stringify([...context.database.participants.values()])).toBe(
      participantBefore
    );
    const limiter = context.app.get(RoomRateLimiter);
    expect(() =>
      limiter.consume(ROOM_LIMITS.condition, [
        created.room.id,
        created.hostParticipant.id,
      ])
    ).not.toThrow();
  });
});

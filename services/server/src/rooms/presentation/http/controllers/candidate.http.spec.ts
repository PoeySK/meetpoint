import request from 'supertest';
import {
  closeRoomsTestContext,
  createRoomsTestContext,
  expectRoomError,
  validCandidatePayload,
  validPayload,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import { CandidateStatus } from '../../../domain/candidate/candidate';
import { RoomStatus } from '../../../domain/room/room-status';

describe('Candidate HTTP contract', () => {
  let app: RoomsTestContext['app'];
  let database: RoomsTestContext['database'];

  beforeEach(async () => {
    ({ app, database } = await createRoomsTestContext());
  });

  afterEach(async () => {
    await closeRoomsTestContext({ app, database });
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
});

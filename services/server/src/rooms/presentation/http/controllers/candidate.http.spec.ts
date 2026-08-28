import request from 'supertest';
import {
  closeRoomsTestContext,
  createRoomsTestContext,
  expectRoomError,
  completedScoreResult,
  validCandidatePayload,
  validConditionPayload,
  validPayload,
  type RoomsTestContext,
} from '../../../test/rooms-http-test-harness';
import { CandidateStatus } from '../../../domain/candidate/candidate';
import { ParticipantStatus } from '../../../domain/participant/participant';
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

  it('allows the HOST to partially update an active Candidate with its version', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(200);

    expect(response.body.candidate).toMatchObject({
      id: candidate.body.candidate.id,
      estimatedCostPerPersonKrw: 22000,
      displayOrder: 1,
      version: 2,
      status: CandidateStatus.ACTIVE,
    });
    expect(response.body.scoreResultStatus).toBe('STALE');
    expect(database.candidates.get(candidate.body.candidate.id)).toMatchObject({
      estimatedCostPerPersonKrw: 22000,
      version: 2,
    });
  });

  it('rejects Candidate updates from MEMBERs and without a valid version header', async () => {
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

    const memberResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(403);
    expectRoomError(memberResponse, 'HOST_ONLY');

    const memberArchive = await request(app.getHttpServer())
      .delete(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .set('If-Match-Version', '1')
      .expect(403);
    expectRoomError(memberArchive, 'HOST_ONLY');

    const invalidToken = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', 'Bearer invalid-token')
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(401);
    expectRoomError(invalidToken, 'INVALID_TOKEN');

    const missingVersion = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(400);
    expectRoomError(missingVersion, 'VALIDATION_ERROR');
  });

  it('validates the merged Candidate when a partial update contains an incomplete value', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ time: { startsAt: '2026-09-01T11:00:00.000Z' } })
      .expect(400);

    expectRoomError(response, 'VALIDATION_ERROR');
    expect(database.candidates.get(candidate.body.candidate.id)).toMatchObject({
      version: 1,
      time: validCandidatePayload().time,
    });
  });

  it('rejects a Candidate update that duplicates another active Candidate', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const first = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(
        validCandidatePayload({
          displayOrder: 2,
          time: {
            startsAt: '2026-09-02T10:00:00.000Z',
            endsAt: '2026-09-02T12:00:00.000Z',
            timezone: 'Asia/Seoul',
          },
        })
      )
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${second.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({
        time: first.body.candidate.time,
        place: first.body.candidate.place,
      })
      .expect(409);

    expectRoomError(response, 'ROOM_STATE_CONFLICT');
    expect(database.candidates.get(second.body.candidate.id)).toMatchObject({
      version: 1,
      time: {
        startsAt: '2026-09-02T10:00:00.000Z',
      },
    });
  });

  it('prevents an old Candidate version from overwriting a newer update', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const candidatePath = `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`;

    await request(app.getHttpServer())
      .patch(candidatePath)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(200);

    const stale = await request(app.getHttpServer())
      .patch(candidatePath)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 24000 })
      .expect(409);

    expectRoomError(stale, 'CANDIDATE_VERSION_CONFLICT');
    expect(database.candidates.get(candidate.body.candidate.id)).toMatchObject({
      estimatedCostPerPersonKrw: 22000,
      version: 2,
    });
  });

  it('archives a Candidate, excludes it from Room details, and stales a calculated result', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const scoreResult = completedScoreResult(
      'score-candidate-archive',
      created.body.room.id
    );
    database.scoreResults.set(scoreResult.id, scoreResult);
    const room = database.rooms.get(created.body.room.id)!;
    room.status = RoomStatus.CALCULATED;
    room.latestScoreResultId = scoreResult.id;

    const response = await request(app.getHttpServer())
      .delete(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .expect(200);

    expect(response.body.candidate).toMatchObject({
      id: candidate.body.candidate.id,
      status: CandidateStatus.ARCHIVED,
      version: 2,
    });
    expect(response.body.candidate.archivedAt).toEqual(expect.any(String));
    expect(response.body.scoreResultStatus).toBe('STALE');
    expect(database.scoreResults.get(scoreResult.id)?.status).toBe('STALE');
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.OPEN
    );

    const roomResponse = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(roomResponse.body.candidates).toEqual([]);

    const repeatArchive = await request(app.getHttpServer())
      .delete(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '2')
      .expect(409);
    expectRoomError(repeatArchive, 'ROOM_STATE_CONFLICT');

    const updateArchived = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '2')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(409);
    expectRoomError(updateArchived, 'ROOM_STATE_CONFLICT');
  });

  it('keeps archived Candidate responses in history but excludes them from active response state', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Response member' })
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
    await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${joined.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
      .expect(200);
    expect(database.participants.get(joined.body.participant.id)?.status).toBe(
      ParticipantStatus.RESPONDED
    );

    await request(app.getHttpServer())
      .delete(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .expect(200);

    expect(database.responses.size).toBe(1);
    expect(database.participants.get(joined.body.participant.id)?.status).toBe(
      ParticipantStatus.JOINED
    );
    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);
    expect(room.body.candidates).toEqual([]);
    expect(room.body.myResponses).toEqual([]);
  });

  it('does not allow a Candidate from another Room to be changed', async () => {
    const firstRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'First room' }))
      .expect(201);
    const secondRoom = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload({ title: 'Second room' }))
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${secondRoom.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${secondRoom.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(
        `/api/v1/rooms/${firstRoom.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${firstRoom.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(404);

    expectRoomError(response, 'RESOURCE_NOT_FOUND');
    expect(database.candidates.get(candidate.body.candidate.id)).toMatchObject({
      version: 1,
      estimatedCostPerPersonKrw: 15000,
    });
  });

  it('rejects Candidate changes in CALCULATING, CONFIRMED, and CLOSED Rooms', async () => {
    for (const status of [
      RoomStatus.CALCULATING,
      RoomStatus.CONFIRMED,
      RoomStatus.CLOSED,
    ]) {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send(validPayload())
        .expect(201);
      const candidate = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send(validCandidatePayload())
        .expect(201);
      database.rooms.get(created.body.room.id)!.status = status;

      const update = await request(app.getHttpServer())
        .patch(
          `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
        )
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .set('If-Match-Version', '1')
        .send({ estimatedCostPerPersonKrw: 22000 })
        .expect(409);
      expectRoomError(update, 'ROOM_STATE_CONFLICT');

      const archive = await request(app.getHttpServer())
        .delete(
          `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
        )
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .set('If-Match-Version', '1')
        .expect(409);
      expectRoomError(archive, 'ROOM_STATE_CONFLICT');
    }
  });

  it('rolls back Candidate, Room, and ScoreResult when an archive save fails', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const scoreResult = completedScoreResult(
      'score-candidate-archive-rollback',
      created.body.room.id
    );
    database.scoreResults.set(scoreResult.id, scoreResult);
    const room = database.rooms.get(created.body.room.id)!;
    room.status = RoomStatus.CALCULATED;
    room.latestScoreResultId = scoreResult.id;
    database.failCandidateSave = true;

    const response = await request(app.getHttpServer())
      .delete(
        `/api/v1/rooms/${created.body.room.id}/candidates/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .expect(500);

    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.candidates.get(candidate.body.candidate.id)).toMatchObject({
      status: CandidateStatus.ACTIVE,
      version: 1,
    });
    expect(database.rooms.get(created.body.room.id)?.status).toBe(
      RoomStatus.CALCULATED
    );
    expect(database.scoreResults.get(scoreResult.id)?.status).toBe('COMPLETED');
  });
});

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
import {
  AvailabilityStatus,
  ParticipantResponseStatus,
  TravelBurden,
} from '../../../domain/participant-response/participant-response';
import { ParticipantStatus } from '../../../domain/participant/participant';
import { RoomStatus } from '../../../domain/room/room-status';

describe('Participant response HTTP contract', () => {
  let app: RoomsTestContext['app'];
  let database: RoomsTestContext['database'];

  beforeEach(async () => {
    ({ app, database } = await createRoomsTestContext());
  });

  afterEach(async () => {
    await closeRoomsTestContext({ app, database });
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

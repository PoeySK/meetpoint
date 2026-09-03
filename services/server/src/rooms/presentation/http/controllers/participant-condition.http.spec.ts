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
import { ParticipantStatus } from '../../../domain/participant/participant';
import { RoomStatus } from '../../../domain/room/room-status';

describe('Participant condition HTTP contract', () => {
  let app: RoomsTestContext['app'];
  let database: RoomsTestContext['database'];

  beforeEach(async () => {
    ({ app, database } = await createRoomsTestContext());
  });

  afterEach(async () => {
    await closeRoomsTestContext({ app, database });
  });

  it('saves and updates only the current participant condition', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const member = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Condition member' })
      .expect(201);
    const path = `/api/v1/rooms/${created.body.room.id}/participants/${member.body.participant.id}/conditions`;

    const first = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(
        validConditionPayload({
          maxBudgetKrw: 30000,
          preferences: {
            requiredTags: ['INDOOR'],
            preferredTags: ['QUIET'],
            avoidTags: ['SMOKING'],
          },
        })
      )
      .expect(200);

    expect(first.body.condition).toMatchObject({
      participantId: member.body.participant.id,
      maxBudgetKrw: 30000,
      preferences: {
        requiredTags: ['INDOOR'],
        preferredTags: ['QUIET'],
        avoidTags: ['SMOKING'],
      },
    });
    expect(first.body.participantStatus).toBe(ParticipantStatus.JOINED);
    expect(database.conditions.size).toBe(1);

    const invalid = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(
        validConditionPayload({
          availabilityWindows: [
            {
              startsAt: '2026-09-01T12:00:00.000Z',
              endsAt: '2026-09-01T10:00:00.000Z',
            },
          ],
          maxBudgetKrw: -1,
          preferences: {
            requiredTags: ['QUIET', 'QUIET'],
            preferredTags: [],
            avoidTags: [],
          },
        })
      )
      .expect(422);
    expectRoomError(invalid, 'CONDITION_INCOMPLETE');

    const wrongParticipant = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${created.body.hostParticipant.id}/conditions`
      )
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(403);
    expectRoomError(wrongParticipant, 'FORBIDDEN');

    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .expect(200);
    expect(room.body.myCondition).toMatchObject({
      participantId: member.body.participant.id,
      maxBudgetKrw: 30000,
    });
    expect(room.body.myCondition.preferences.avoidTags).toEqual(['SMOKING']);
    const hostRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${created.body.room.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(hostRoom.body.myCondition).toBeNull();
    expect(JSON.stringify(hostRoom.body)).not.toContain('SMOKING');

    database.rooms.get(created.body.room.id)!.status = RoomStatus.CONFIRMED;
    const confirmed = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(409);
    expectRoomError(confirmed, 'ROOM_STATE_CONFLICT');
  });

  it('moves a participant to RESPONDED after every active response is saved', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const member = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Complete member' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.id}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validCandidatePayload())
      .expect(201);
    const conditionPath = `/api/v1/rooms/${created.body.room.id}/participants/${member.body.participant.id}/conditions`;
    await request(app.getHttpServer())
      .put(conditionPath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(200);

    const response = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${member.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
      .expect(200);

    expect(response.body.participantStatus).toBe(ParticipantStatus.RESPONDED);
    expect(database.participants.get(member.body.participant.id)?.status).toBe(
      ParticipantStatus.RESPONDED
    );

    const unchangedCondition = await request(app.getHttpServer())
      .put(conditionPath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload())
      .expect(200);

    expect(unchangedCondition.body.participantStatus).toBe(
      ParticipantStatus.RESPONDED
    );

    const changedCondition = await request(app.getHttpServer())
      .put(conditionPath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(
        validConditionPayload({
          maxBudgetKrw: 20000,
        })
      )
      .expect(200);

    expect(changedCondition.body.participantStatus).toBe(
      ParticipantStatus.RESPONDED
    );
    expect(database.participants.get(member.body.participant.id)?.status).toBe(
      ParticipantStatus.RESPONDED
    );

    const resubmitted = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${member.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
      .expect(200);

    expect(resubmitted.body.participantStatus).toBe(
      ParticipantStatus.RESPONDED
    );

    await request(app.getHttpServer())
      .put(conditionPath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(
        validConditionPayload({
          availabilityWindows: [
            {
              startsAt: '2026-09-01T09:00:00.000Z',
              endsAt: '2026-09-01T11:00:00.000Z',
            },
          ],
        })
      )
      .expect(200);

    const outsideWindow = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${created.body.room.id}/participants/${member.body.participant.id}/responses/${candidate.body.candidate.id}`
      )
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
      .expect(200);

    expect(outsideWindow.body.response.availabilityStatus).toBe('AVAILABLE');
    expect(outsideWindow.body.participantStatus).toBe(
      ParticipantStatus.RESPONDED
    );
  });

  it('keeps a failed condition save atomic', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send(validPayload())
      .expect(201);
    const path = `/api/v1/rooms/${created.body.room.id}/participants/${created.body.hostParticipant.id}/conditions`;
    database.failConditionSave = true;

    const response = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(validConditionPayload())
      .expect(500);

    expectRoomError(response, 'INTERNAL_ERROR');
    expect(database.conditions.size).toBe(0);
  });
});

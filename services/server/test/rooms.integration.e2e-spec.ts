import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  Participant,
  ParticipantStatus,
} from '../src/participants/entities/participant.entity';
import {
  Candidate,
  CandidateStatus,
} from '../src/rooms/entities/candidate.entity';
import { Decision } from '../src/rooms/entities/decision.entity';
import {
  AvailabilityStatus,
  ParticipantResponse,
  TravelBurden,
} from '../src/rooms/entities/participant-response.entity';
import { Room, RoomStatus } from '../src/rooms/entities/room.entity';
import { ScoreResult } from '../src/rooms/entities/score-result.entity';
import { RoomsModule } from '../src/rooms/rooms.module';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: databaseUrl,
      entities: [
        Room,
        Participant,
        Candidate,
        Decision,
        ParticipantResponse,
        ScoreResult,
      ],
      synchronize: false,
      migrationsRun: false,
    }),
    RoomsModule,
  ],
})
class RoomsIntegrationModule {}

function candidatePayload() {
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
  };
}

describe('Room Candidate and ParticipantResponse integration', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let roomId: string | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RoomsIntegrationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    if (roomId) {
      await dataSource.getRepository(Room).delete({ id: roomId });
      roomId = undefined;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists a Candidate and creates then updates one ParticipantResponse over HTTP', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Integration room',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Integration host' },
      })
      .expect(201);
    roomId = created.body.room.id;

    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Integration member' })
      .expect(201);

    const memberCandidateAttempt = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send(candidatePayload())
      .expect(403);
    expect(memberCandidateAttempt.body.error).toMatchObject({
      code: 'HOST_ONLY',
      details: {},
      requestId: expect.stringMatching(/^req_/),
    });

    const candidateResponse = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(candidatePayload())
      .expect(201);
    const candidateId = candidateResponse.body.candidate.id;

    const persistedCandidate = await dataSource
      .getRepository(Candidate)
      .findOneBy({ id: candidateId });
    expect(persistedCandidate).toMatchObject({
      roomId,
      status: CandidateStatus.ACTIVE,
      displayOrder: 1,
      estimatedCostPerPersonKrw: 15000,
      tags: ['QUIET', 'COFFEE'],
    });

    const firstResponse = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${roomId}/participants/${joined.body.participant.id}/responses/${candidateId}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        travelBurden: TravelBurden.EASY,
        note: 'First response',
      })
      .expect(200);

    const secondResponse = await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${roomId}/participants/${joined.body.participant.id}/responses/${candidateId}`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .send({
        availabilityStatus: AvailabilityStatus.MAYBE,
        travelBurden: TravelBurden.HARD,
        note: 'Updated response',
      })
      .expect(200);

    expect(secondResponse.body.response.id).toBe(
      firstResponse.body.response.id
    );
    expect(secondResponse.body.response).toMatchObject({
      participantId: joined.body.participant.id,
      candidateId,
      availabilityStatus: AvailabilityStatus.MAYBE,
      travelBurden: TravelBurden.HARD,
      note: 'Updated response',
    });
    expect(secondResponse.body.scoreResultStatus).toBe('STALE');

    const persistedResponses = await dataSource
      .getRepository(ParticipantResponse)
      .findBy({ roomId });
    expect(persistedResponses).toHaveLength(1);
    expect(persistedResponses[0]).toMatchObject({
      participantId: joined.body.participant.id,
      candidateId,
      availabilityStatus: AvailabilityStatus.MAYBE,
      travelBurden: TravelBurden.HARD,
    });

    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
      .expect(200);
    expect(room.body.room.status).toBe('OPEN');
    expect(room.body.candidates).toHaveLength(1);
    expect(JSON.stringify(room.body)).not.toContain(
      joined.body.access.participantToken
    );
  });

  it('supports MEMBER leave, HOST kick, token revocation, and active roster filtering', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Lifecycle integration room',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Lifecycle host' },
      })
      .expect(201);
    roomId = created.body.room.id;

    const firstMember = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'First lifecycle member' })
      .expect(201);
    const secondMember = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Second lifecycle member' })
      .expect(201);

    const left = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/leave`)
      .set(
        'Authorization',
        `Bearer ${firstMember.body.access.participantToken}`
      )
      .expect(200);
    expect(left.body.participant).toMatchObject({
      id: firstMember.body.participant.id,
      status: ParticipantStatus.LEFT,
    });
    expect(left.body.roomStatus).toBe(RoomStatus.OPEN);

    const firstPersisted = await dataSource
      .getRepository(Participant)
      .findOneBy({ id: firstMember.body.participant.id });
    expect(firstPersisted).toMatchObject({
      status: ParticipantStatus.LEFT,
    });
    expect(firstPersisted?.tokenRevokedAt).toEqual(expect.any(Date));

    const activeRoom = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(activeRoom.body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.hostParticipant.id }),
        expect.objectContaining({ id: secondMember.body.participant.id }),
      ])
    );
    expect(activeRoom.body.participants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstMember.body.participant.id }),
      ])
    );

    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set(
        'Authorization',
        `Bearer ${firstMember.body.access.participantToken}`
      )
      .expect(401);

    const kicked = await request(app.getHttpServer())
      .post(
        `/api/v1/rooms/${roomId}/participants/${secondMember.body.participant.id}/kick`
      )
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(kicked.body.participant.status).toBe(ParticipantStatus.REMOVED);

    const secondPersisted = await dataSource
      .getRepository(Participant)
      .findOneBy({ id: secondMember.body.participant.id });
    expect(secondPersisted).toMatchObject({
      status: ParticipantStatus.REMOVED,
    });
    expect(secondPersisted?.tokenRevokedAt).toEqual(expect.any(Date));

    const rejoined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'First lifecycle member' })
      .expect(201);
    expect(rejoined.body.participant.id).not.toBe(
      firstMember.body.participant.id
    );
    expect(rejoined.body.participant.id).not.toBe(
      secondMember.body.participant.id
    );
  });

  it('allows only one concurrent leave request for the same Participant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Concurrent lifecycle room',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Concurrent host' },
      })
      .expect(201);
    roomId = created.body.room.id;
    const joined = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Concurrent member' })
      .expect(201);

    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${joined.body.access.participantToken}`),
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${joined.body.access.participantToken}`),
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(
      results.filter((result) => [401, 409].includes(result.status))
    ).toHaveLength(1);
    const persisted = await dataSource
      .getRepository(Participant)
      .findOneBy({ id: joined.body.participant.id });
    expect(persisted?.status).toBe(ParticipantStatus.LEFT);
  });
});

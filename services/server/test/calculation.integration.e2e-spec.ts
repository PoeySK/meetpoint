import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Participant } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../src/rooms/infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from '../src/rooms/infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { Room } from '../src/rooms/infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from '../src/rooms/infrastructure/persistence/typeorm/entities/score-result.entity';
import { RoomsModule } from '../src/rooms/rooms.module';

const runCalculationE2e = process.env.RUN_CALCULATION_E2E === 'true';

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
        ParticipantCondition,
      ],
      synchronize: false,
      migrationsRun: false,
    }),
    RoomsModule,
  ],
})
class CalculationIntegrationModule {}

function candidatePayload(displayOrder: number) {
  return {
    displayOrder,
    time: {
      startsAt: `2026-09-01T${displayOrder === 1 ? '10:00:00' : '14:00:00'}.000Z`,
      endsAt: `2026-09-01T${displayOrder === 1 ? '12:00:00' : '16:00:00'}.000Z`,
      timezone: 'Asia/Seoul',
    },
    place: {
      name: `MeetPoint place ${displayOrder}`,
      address: 'Seoul Jung-gu 1',
      area: 'Jung-gu',
    },
    estimatedCostPerPersonKrw: 15000,
    tags: ['QUIET'],
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const describeCalculation = runCalculationE2e ? describe : describe.skip;

describeCalculation(
  'Room calculation PostgreSQL + NestJS + Rust HTTP e2e',
  () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let roomId: string | undefined;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [CalculationIntegrationModule],
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

    it('runs the HOST calculation flow and rejects MEMBER and invalid state requests', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send({
          title: 'Calculation integration room',
          timezone: 'Asia/Seoul',
          host: { displayName: 'Calculation host' },
        })
        .expect(201);
      roomId = created.body.room.id;

      await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/calculations`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send({ clientRequestId: 'invalid-draft-calculation' })
        .expect(409)
        .expect(({ body }) => {
          expect(body.error).toMatchObject({
            code: 'ROOM_STATE_CONFLICT',
            details: {},
            requestId: expect.stringMatching(/^req_/),
          });
        });

      const members = [] as Array<{ token: string; id: string }>;
      for (const displayName of ['Member one', 'Member two']) {
        const joined = await request(app.getHttpServer())
          .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
          .send({ displayName })
          .expect(201);
        members.push({
          token: joined.body.access.participantToken,
          id: joined.body.participant.id,
        });
      }

      const candidates = [] as string[];
      for (const displayOrder of [1, 2]) {
        const candidate = await request(app.getHttpServer())
          .post(`/api/v1/rooms/${roomId}/candidates`)
          .set('Authorization', `Bearer ${created.body.access.hostToken}`)
          .send(candidatePayload(displayOrder))
          .expect(201);
        candidates.push(candidate.body.candidate.id);
      }

      const participants = [
        {
          id: created.body.hostParticipant.id,
          token: created.body.access.hostToken,
        },
        ...members,
      ];
      for (const participant of participants) {
        await request(app.getHttpServer())
          .put(
            `/api/v1/rooms/${roomId}/participants/${participant.id}/conditions`
          )
          .set('Authorization', `Bearer ${participant.token}`)
          .send({
            availabilityWindows: [
              {
                startsAt: '2026-09-01T09:00:00.000Z',
                endsAt: '2026-09-01T18:00:00.000Z',
              },
            ],
            maxBudgetKrw: null,
            preferences: {
              requiredTags: [],
              preferredTags: [],
              avoidTags: [],
            },
          })
          .expect(200);
      }
      for (const participant of participants) {
        for (const candidateId of candidates) {
          await request(app.getHttpServer())
            .put(
              `/api/v1/rooms/${roomId}/participants/${participant.id}/responses/${candidateId}`
            )
            .set('Authorization', `Bearer ${participant.token}`)
            .send({ availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' })
            .expect(200);
        }
      }

      await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/calculations`)
        .set('Authorization', `Bearer ${members[0].token}`)
        .send({ clientRequestId: 'member-calculation' })
        .expect(403)
        .expect(({ body }) => {
          expect(body.error).toMatchObject({
            code: 'HOST_ONLY',
            details: {},
            requestId: expect.stringMatching(/^req_/),
          });
        });

      const started = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/calculations`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send({ clientRequestId: 'host-calculation' })
        .expect(202);
      expect(started.body.calculation).toMatchObject({
        roomId,
        status: 'RUNNING',
        policyVersion: 'condition-aware-1',
        scoringProfile: 'CONDITION_AWARE',
      });

      let completed;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        completed = await request(app.getHttpServer())
          .get(
            `/api/v1/rooms/${roomId}/calculations/${started.body.calculation.id}`
          )
          .set('Authorization', `Bearer ${members[0].token}`)
          .expect(200);
        if (completed.body.calculation.status !== 'RUNNING') {
          break;
        }
        await wait(100);
      }

      expect(completed.body.calculation).toMatchObject({
        status: 'COMPLETED',
        scoringProfile: 'CONDITION_AWARE',
        metadata: {
          scoringProfile: 'CONDITION_AWARE',
        },
      });
      expect(completed.body.calculation.candidates).toHaveLength(2);

      const room = await request(app.getHttpServer())
        .get(`/api/v1/rooms/${roomId}`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .expect(200);
      expect(room.body.room.status).toBe('CALCULATED');

      const latest = await request(app.getHttpServer())
        .get(`/api/v1/rooms/${roomId}/score-results/latest`)
        .set('Authorization', `Bearer ${members[0].token}`)
        .expect(200);
      expect(latest.body.scoreResult).toMatchObject({
        id: started.body.calculation.id,
        status: 'COMPLETED',
        scoringProfile: 'CONDITION_AWARE',
      });

      const selectedCandidateId =
        completed.body.calculation.candidates[0].candidateId;
      const confirmed = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/decision`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send({
          candidateId: selectedCandidateId,
          scoreResultId: started.body.calculation.id,
          acknowledgeIssues: false,
        })
        .expect(201);
      expect(confirmed.body).toMatchObject({
        decision: {
          candidateId: selectedCandidateId,
          scoreResultId: started.body.calculation.id,
          status: 'CONFIRMED',
        },
        roomStatus: 'CONFIRMED',
      });

      const decision = await request(app.getHttpServer())
        .get(`/api/v1/rooms/${roomId}/decision`)
        .set('Authorization', `Bearer ${members[0].token}`)
        .expect(200);
      expect(decision.body.decision).toMatchObject({
        id: confirmed.body.decision.id,
        status: 'CONFIRMED',
        candidate: { id: selectedCandidateId },
      });

      const reopened = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/decision/reopen`)
        .set('Authorization', `Bearer ${created.body.access.hostToken}`)
        .send({ reason: '통합 테스트에서 재검토' })
        .expect(200);
      expect(reopened.body).toMatchObject({
        decision: { id: confirmed.body.decision.id, status: 'REOPENED' },
        roomStatus: 'OPEN',
        nextStep: 'CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE',
      });
    });
  }
);

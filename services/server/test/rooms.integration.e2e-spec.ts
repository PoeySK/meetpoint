import { INestApplication, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DecisionStatus } from '../src/rooms/domain/decision/decision';
import {
  completedScoreResult,
  validConditionPayload,
} from '../src/rooms/test/rooms-http-test-harness';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ReconfirmEditedCandidateResponses20261012000000 } from '../src/database/migrations/20261012000000-reconfirm-edited-candidate-responses';
import { Participant } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../src/rooms/infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from '../src/rooms/infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from '../src/rooms/infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { Room } from '../src/rooms/infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from '../src/rooms/infrastructure/persistence/typeorm/entities/score-result.entity';
import { CalculationJob } from '../src/rooms/infrastructure/persistence/typeorm/entities/calculation-job.entity';
import { ParticipantStatus } from '../src/rooms/domain/participant/participant';
import { CandidateStatus } from '../src/rooms/domain/candidate/candidate';
import {
  AvailabilityStatus,
  ParticipantResponseStatus,
  TravelBurden,
} from '../src/rooms/domain/participant-response/participant-response';
import { RoomStatus } from '../src/rooms/domain/room/room-status';
import { RoomsModule } from '../src/rooms/rooms.module';
import { CalculationJobRunner } from '../src/rooms/application/calculation-job.runner';
import {
  ROOM_LIMITS,
  RoomRateLimiter,
} from '../src/rooms/presentation/http/rate-limit/room-rate-limiter';

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
        CalculationJob,
        ParticipantCondition,
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
    })
      .overrideProvider(CalculationJobRunner)
      .useValue({ trigger: jest.fn() })
      .compile();

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

  beforeEach(() => {
    // 각 DB 시나리오의 quota를 격리한다. 제한 자체는 별도 HTTP/DB 테스트에서 검증한다.
    app.get(RoomRateLimiter).onModuleDestroy();
  });

  afterAll(async () => {
    await app.close();
  });

  async function reconfirmationFixture() {
    const created = (
      await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send({
          title: 'Reconfirmation integration',
          timezone: 'Asia/Seoul',
          host: { displayName: 'Host' },
        })
        .expect(201)
    ).body;
    roomId = created.room.id;
    const prefix = `/api/v1/rooms/${roomId}`;
    const actors = [
      {
        id: created.hostParticipant.id as string,
        token: created.access.hostToken as string,
      },
    ];
    for (const displayName of ['Member one', 'Member two']) {
      const member = (
        await request(app.getHttpServer())
          .post(`/api/v1/rooms/${created.room.roomCode}/participants`)
          .send({ displayName })
          .expect(201)
      ).body;
      actors.push({
        id: member.participant.id as string,
        token: member.access.participantToken as string,
      });
    }
    const candidates: Candidate[] = [];
    for (const displayOrder of [1, 2]) {
      const candidate = await request(app.getHttpServer())
        .post(`${prefix}/candidates`)
        .auth(actors[0].token, { type: 'bearer' })
        .send({
          ...candidatePayload(),
          displayOrder,
          place: {
            name: `Cafe ${displayOrder}`,
            address: `Seoul ${displayOrder}`,
            area: 'Seoul',
          },
        })
        .expect(201);
      candidates.push(candidate.body.candidate as Candidate);
    }
    const responsePath = (actorId: string, candidateId: string) =>
      `${prefix}/participants/${actorId}/responses/${candidateId}`;
    const input = {
      candidateVersion: 1,
      availabilityStatus: 'AVAILABLE',
      travelBurden: 'EASY',
      note: 'Previous opinion',
    };
    for (const actor of actors)
      for (const candidate of candidates) {
        await request(app.getHttpServer())
          .put(responsePath(actor.id, candidate.id))
          .auth(actor.token, { type: 'bearer' })
          .send(input)
          .expect(200);
      }
    return { prefix, actors, candidates, responsePath, input };
  }

  it('serializes candidate edits and old response saves; excludes only changed opinions from the persisted job snapshot', async () => {
    const { prefix, actors, candidates, responsePath, input } =
      await reconfirmationFixture();
    const candidate = candidates[0];
    const [edited, savedOld] = await Promise.all([
      request(app.getHttpServer())
        .patch(`${prefix}/candidates/${candidate.id}`)
        .auth(actors[0].token, { type: 'bearer' })
        .set('If-Match-Version', '1')
        .send({ estimatedCostPerPersonKrw: 21000 }),
      request(app.getHttpServer())
        .put(responsePath(actors[1].id, candidate.id))
        .auth(actors[1].token, { type: 'bearer' })
        .send(input),
    ]);
    expect(edited.status).toBe(200);
    expect([200, 409]).toContain(savedOld.status);
    const stored = await dataSource
      .getRepository(ParticipantResponse)
      .findBy({ roomId });
    expect(
      stored
        .filter((r) => r.candidateId === candidate.id)
        .every(
          (r) =>
            r.status === ParticipantResponseStatus.RECONFIRM_REQUIRED &&
            r.note === 'Previous opinion'
        )
    ).toBe(true);
    expect(
      stored
        .filter((r) => r.candidateId === candidates[1].id)
        .every((r) => r.status === ParticipantResponseStatus.SUBMITTED)
    ).toBe(true);
    expect(
      (await dataSource.getRepository(Participant).findBy({ roomId })).every(
        (p) => p.status === ParticipantStatus.JOINED
      )
    ).toBe(true);
    await request(app.getHttpServer())
      .put(responsePath(actors[1].id, candidate.id))
      .auth(actors[1].token, { type: 'bearer' })
      .send(input)
      .expect(409);
    await request(app.getHttpServer())
      .put(responsePath(actors[1].id, candidate.id))
      .auth(actors[1].token, { type: 'bearer' })
      .send({ ...input, candidateVersion: 2 })
      .expect(200);
    expect(
      (
        await dataSource
          .getRepository(Participant)
          .findOneByOrFail({ id: actors[1].id })
      ).status
    ).toBe('RESPONDED');
    const started = await request(app.getHttpServer())
      .post(`${prefix}/calculations`)
      .auth(actors[0].token, { type: 'bearer' })
      .send({ clientRequestId: randomUUID() })
      .expect(202);
    const score = await dataSource
      .getRepository(ScoreResult)
      .findOneByOrFail({ id: started.body.calculation.id });
    expect(score.coverage).toMatchObject({
      submittedResponses: 4,
      expectedResponses: 6,
    });
    const job = await dataSource
      .getRepository(CalculationJob)
      .findOneByOrFail({ scoreResultId: score.id });
    expect(
      job.snapshot.participants
        .find((p) => p.participantId === actors[0].id)!
        .responses.map((r) => r.candidateId)
    ).toEqual([candidates[1].id]);
    expect(
      job.snapshot.participants.find((p) => p.participantId === actors[1].id)!
        .responses
    ).toHaveLength(2);
    const migrationRunner = dataSource.createQueryRunner();
    try {
      await expect(
        new ReconfirmEditedCandidateResponses20261012000000().up(
          migrationRunner
        )
      ).rejects.toThrow('Drain calculation jobs');
    } finally {
      await migrationRunner.release();
    }
    // 완료 응답에 coverage가 잘못 완전하게 기록되어도 저장된 재확인 상태가 확정을 막는다.
    await dataSource.getRepository(ScoreResult).update(score.id, {
      status: 'COMPLETED' as ScoreResult['status'],
      coverage: {
        respondedParticipants: 3,
        totalParticipants: 3,
        submittedResponses: 6,
        expectedResponses: 6,
      },
      candidates: [
        {
          candidateId: candidate.id,
          rank: 1,
          overallScore: 100,
          eligible: true,
          matchLevel: 'FULL',
          hardConflictCount: 0,
          coverage: { submittedResponses: 3, expectedResponses: 3 },
          participantBreakdown: [],
          reasons: [],
          conflicts: [],
          blockingIssues: [],
          explanationFlags: [],
        },
      ],
    });
    await dataSource
      .getRepository(Room)
      .update(roomId!, { status: RoomStatus.CALCULATED });
    await request(app.getHttpServer())
      .post(`${prefix}/decision`)
      .auth(actors[0].token, { type: 'bearer' })
      .send({
        candidateId: candidate.id,
        scoreResultId: score.id,
        acknowledgeIssues: false,
      })
      .expect(422);
    expect(await dataSource.getRepository(Decision).countBy({ roomId })).toBe(
      0
    );
  });

  it('rolls back the whole candidate edit when PostgreSQL rejects response invalidation', async () => {
    const { prefix, actors, candidates } = await reconfirmationFixture();
    const score = await dataSource
      .getRepository(ScoreResult)
      .save(completedScoreResult(randomUUID(), roomId!));
    await dataSource.getRepository(Room).update(roomId!, {
      latestScoreResultId: score.id,
      status: RoomStatus.CALCULATED,
    });
    const before = {
      room: await dataSource
        .getRepository(Room)
        .findOneByOrFail({ id: roomId! }),
      candidate: await dataSource
        .getRepository(Candidate)
        .findOneByOrFail({ id: candidates[0].id }),
      responses: await dataSource
        .getRepository(ParticipantResponse)
        .find({ where: { roomId }, order: { id: 'ASC' } }),
      score: await dataSource
        .getRepository(ScoreResult)
        .findOneByOrFail({ id: score.id }),
    };
    const name = `reconfirm_failure_${randomUUID().replaceAll('-', '')}`;
    await dataSource.query(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'RECONFIRM_REQUIRED' THEN RAISE EXCEPTION 'Owned reconfirmation rollback fixture'; END IF; RETURN NEW; END; $$`
    );
    try {
      await dataSource.query(
        `CREATE TRIGGER "${name}" BEFORE UPDATE ON participant_responses FOR EACH ROW EXECUTE FUNCTION "${name}"()`
      );
      await request(app.getHttpServer())
        .patch(`${prefix}/candidates/${candidates[0].id}`)
        .auth(actors[0].token, { type: 'bearer' })
        .set('If-Match-Version', '1')
        .send({ estimatedCostPerPersonKrw: 21000 })
        .expect(500);
      const after = {
        room: await dataSource
          .getRepository(Room)
          .findOneByOrFail({ id: roomId! }),
        candidate: await dataSource
          .getRepository(Candidate)
          .findOneByOrFail({ id: candidates[0].id }),
        responses: await dataSource
          .getRepository(ParticipantResponse)
          .find({ where: { roomId }, order: { id: 'ASC' } }),
        score: await dataSource
          .getRepository(ScoreResult)
          .findOneByOrFail({ id: score.id }),
      };
      expect(isDeepStrictEqual(after, before)).toBe(true);
      expect(
        (await dataSource.getRepository(Participant).findBy({ roomId })).every(
          (p) => p.status === ParticipantStatus.RESPONDED
        )
      ).toBe(true);
    } finally {
      await dataSource.query(
        `DROP TRIGGER IF EXISTS "${name}" ON participant_responses`
      );
      await dataSource.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
  });

  it.each([RoomStatus.CALCULATED, RoomStatus.CONFIRMED, RoomStatus.CLOSED])(
    'migrates legacy %s responses conservatively while preserving values and decision history',
    async (status) => {
      const { actors, candidates } = await reconfirmationFixture();
      await dataSource
        .getRepository(Candidate)
        .update(candidates[0].id, { version: 2 });
      const score = await dataSource
        .getRepository(ScoreResult)
        .save(completedScoreResult(randomUUID(), roomId!));
      const historicalDecision = await dataSource.getRepository(Decision).save({
        id: randomUUID(),
        roomId: roomId!,
        candidateId: candidates[0].id,
        scoreResultId: score.id,
        decidedByParticipantId: actors[0].id,
        status: DecisionStatus.REOPENED,
        acknowledgeIssues: false,
        decisionNote: 'Retained decision',
        confirmedAt: new Date(),
        replacedDecisionId: null,
        reopenedAt: new Date(),
        reopenReason: 'Review',
      });
      await dataSource.getRepository(Room).update(roomId!, {
        latestScoreResultId: score.id,
        currentDecisionId: historicalDecision.id,
        status,
      });
      const decisionBefore = await dataSource
        .getRepository(Decision)
        .findOneByOrFail({ id: historicalDecision.id });
      const runner = dataSource.createQueryRunner();
      try {
        await runner.connect();
        await runner.startTransaction();
        await new ReconfirmEditedCandidateResponses20261012000000().up(runner);
        await runner.commitTransaction();
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      const responses = await dataSource
        .getRepository(ParticipantResponse)
        .findBy({ roomId });
      if (status !== RoomStatus.CALCULATED) {
        expect(
          responses.every(
            (r) =>
              r.status === ParticipantResponseStatus.SUBMITTED &&
              r.note === 'Previous opinion'
          )
        ).toBe(true);
        expect(
          (
            await dataSource
              .getRepository(Room)
              .findOneByOrFail({ id: roomId! })
          ).status
        ).toBe(status);
        expect(
          (
            await dataSource
              .getRepository(ScoreResult)
              .findOneByOrFail({ id: score.id })
          ).status
        ).toBe('COMPLETED');
        expect(
          isDeepStrictEqual(
            await dataSource
              .getRepository(Decision)
              .findOneByOrFail({ id: historicalDecision.id }),
            decisionBefore
          )
        ).toBe(true);
        return;
      }
      expect(
        responses
          .filter((r) => r.candidateId === candidates[0].id)
          .every(
            (r) =>
              r.status === ParticipantResponseStatus.RECONFIRM_REQUIRED &&
              r.note === 'Previous opinion'
          )
      ).toBe(true);
      expect(
        responses
          .filter((r) => r.candidateId === candidates[1].id)
          .every((r) => r.status === ParticipantResponseStatus.SUBMITTED)
      ).toBe(true);
      expect(
        (await dataSource.getRepository(Room).findOneByOrFail({ id: roomId! }))
          .status
      ).toBe('OPEN');
      const afterScore = await dataSource
        .getRepository(ScoreResult)
        .findOneByOrFail({ id: score.id });
      expect(isDeepStrictEqual(afterScore.candidates, score.candidates)).toBe(
        true
      );
      expect(afterScore.status).toBe('STALE');
      expect(
        isDeepStrictEqual(
          await dataSource
            .getRepository(Decision)
            .findOneByOrFail({ id: historicalDecision.id }),
          decisionBefore
        )
      ).toBe(true);
      await expect(
        new ReconfirmEditedCandidateResponses20261012000000().down()
      ).rejects.toThrow('forward fix');
    }
  );

  it('recovers expired HOST/MEMBER credentials while preserving conditions, responses, results and Decision history', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Recovery integration fixture',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Recovery host' },
      })
      .expect(201);
    roomId = created.body.room.id;
    const member = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
      .send({ displayName: 'Recovery member' })
      .expect(201);
    const candidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(candidatePayload())
      .expect(201);
    await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${roomId}/participants/${member.body.participant.id}/conditions`
      )
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send(validConditionPayload({ maxBudgetKrw: 25000 }))
      .expect(200);
    const responsePath = `/api/v1/rooms/${roomId}/participants/${member.body.participant.id}/responses/${candidate.body.candidate.id}`;
    await request(app.getHttpServer())
      .put(responsePath)
      .set('Authorization', `Bearer ${member.body.access.participantToken}`)
      .send({
        candidateVersion: 1,
        availabilityStatus: 'AVAILABLE',
        travelBurden: 'EASY',
        note: 'Preserved in PostgreSQL',
      })
      .expect(200);
    const scoreFixture = completedScoreResult(randomUUID(), roomId!);
    scoreFixture.ranking = [candidate.body.candidate.id];
    scoreFixture.candidates = [
      {
        candidateId: candidate.body.candidate.id,
        rank: 1,
        overallScore: 90,
        eligible: true,
        matchLevel: 'FULL',
        hardConflictCount: 0,
        coverage: { submittedResponses: 1, expectedResponses: 2 },
        participantBreakdown: [],
        reasons: [],
        conflicts: [],
        blockingIssues: [],
        explanationFlags: [],
      },
    ];
    const score = await dataSource
      .getRepository(ScoreResult)
      .save(scoreFixture);
    const oldDecision = await dataSource.getRepository(Decision).save({
      id: randomUUID(),
      roomId: roomId!,
      candidateId: candidate.body.candidate.id,
      scoreResultId: score.id,
      decidedByParticipantId: created.body.hostParticipant.id,
      status: DecisionStatus.SUPERSEDED,
      acknowledgeIssues: false,
      decisionNote: 'History retained',
      confirmedAt: new Date(),
      replacedDecisionId: null,
      reopenedAt: null,
      reopenReason: null,
    });
    const decision = await dataSource.getRepository(Decision).save({
      ...oldDecision,
      id: randomUUID(),
      status: DecisionStatus.CONFIRMED,
      replacedDecisionId: oldDecision.id,
    });
    await dataSource.getRepository(Room).update(roomId!, {
      status: RoomStatus.CALCULATED,
      latestScoreResultId: score.id,
      currentDecisionId: decision.id,
    });
    const conditionsBefore = await dataSource
      .getRepository(ParticipantCondition)
      .findBy({ roomId });
    const responsesBefore = await dataSource
      .getRepository(ParticipantResponse)
      .findBy({ roomId });
    const scoresBefore = await dataSource
      .getRepository(ScoreResult)
      .findBy({ roomId });
    const decisionsBefore = await dataSource
      .getRepository(Decision)
      .find({ where: { roomId }, order: { id: 'ASC' } });
    const countBefore = await dataSource
      .getRepository(Participant)
      .countBy({ roomId });
    await dataSource
      .getRepository(Participant)
      .update({ roomId }, { tokenExpiresAt: new Date(Date.now() - 1) });
    const hostRecovery = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .send({ recoveryCode: created.body.recovery.code })
      .expect(201);
    expect(hostRecovery.body.participant).toMatchObject({
      id: created.body.hostParticipant.id,
      role: 'HOST',
    });
    expect(
      (await dataSource.getRepository(Room).findOneByOrFail({ id: roomId! }))
        .status
    ).toBe(RoomStatus.CALCULATED);
    await dataSource
      .getRepository(Room)
      .update(roomId!, { status: RoomStatus.CONFIRMED });
    const roomBefore = await dataSource
      .getRepository(Room)
      .findOneByOrFail({ id: roomId! });
    const memberRecovery = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .send({ recoveryCode: member.body.recovery.code })
      .expect(201);
    expect(memberRecovery.body.participant).toMatchObject({
      id: member.body.participant.id,
      role: 'MEMBER',
      status: 'RESPONDED',
    });
    const details = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set(
        'Authorization',
        `Bearer ${memberRecovery.body.access.participantToken}`
      )
      .expect(200);
    expect(details.body.myCondition.maxBudgetKrw).toBe(25000);
    expect(details.body.myResponses[0].note).toBe('Preserved in PostgreSQL');
    await request(app.getHttpServer())
      .put(responsePath)
      .set(
        'Authorization',
        `Bearer ${memberRecovery.body.access.participantToken}`
      )
      .send({
        candidateVersion: 1,
        availabilityStatus: 'MAYBE',
        travelBurden: 'HARD',
      })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}/decision`)
      .set(
        'Authorization',
        `Bearer ${hostRecovery.body.access.participantToken}`
      )
      .expect(200);
    expect(
      await dataSource.getRepository(Participant).countBy({ roomId })
    ).toBe(countBefore);
    expect(
      await dataSource.getRepository(Room).findOneByOrFail({ id: roomId! })
    ).toEqual(roomBefore);
    expect(
      await dataSource.getRepository(ParticipantCondition).findBy({ roomId })
    ).toEqual(conditionsBefore);
    expect(
      await dataSource.getRepository(ParticipantResponse).findBy({ roomId })
    ).toEqual(responsesBefore);
    expect(
      await dataSource.getRepository(ScoreResult).findBy({ roomId })
    ).toEqual(scoresBefore);
    expect(
      await dataSource
        .getRepository(Decision)
        .find({ where: { roomId }, order: { id: 'ASC' } })
    ).toEqual(decisionsBefore);
  });

  it('serializes actual PostgreSQL recovery locks and permits credential reuse with only the final token valid', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Concurrent recovery fixture',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Concurrent recovery host' },
      })
      .expect(201);
    roomId = created.body.room.id;
    const recover = () =>
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/recovery`)
        .send({ recoveryCode: created.body.recovery.code })
        .expect(201);
    const results = await Promise.all([recover(), recover()]);
    const statuses = await Promise.all(
      results.map((result) =>
        request(app.getHttpServer())
          .get(`/api/v1/rooms/${roomId}`)
          .set('Authorization', `Bearer ${result.body.access.participantToken}`)
          .then((response) => response.status)
      )
    );
    expect(statuses.sort()).toEqual([200, 401]);
    await recover();
    expect(
      await dataSource.getRepository(Participant).countBy({ roomId })
    ).toBe(1);
  });

  it('rolls back recovery if PostgreSQL rejects a token replacement after UPDATE', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Recovery rollback fixture',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Rollback host' },
      })
      .expect(201);
    roomId = created.body.room.id;
    const before = await dataSource
      .getRepository(Participant)
      .findOneByOrFail({ id: created.body.hostParticipant.id });
    const suffix = randomUUID().replaceAll('-', '');
    const name = `recovery_test_${suffix}`;
    try {
      await dataSource.query(
        `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${before.id}' THEN RAISE EXCEPTION 'Recovery test failure'; END IF; RETURN NEW; END $$`
      );
      await dataSource.query(
        `CREATE TRIGGER "${name}" AFTER UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION "${name}"()`
      );
      const failed = await request(app.getHttpServer())
        .post(`/api/v1/rooms/${roomId}/recovery`)
        .send({ recoveryCode: created.body.recovery.code })
        .expect(500);
      expect(failed.body.error.code).toBe('INTERNAL_ERROR');
      expect(
        isDeepStrictEqual(
          await dataSource
            .getRepository(Participant)
            .findOneByOrFail({ id: before.id }),
          before
        )
      ).toBe(true);
    } finally {
      await dataSource.query(
        `DROP TRIGGER IF EXISTS "${name}" ON participants`
      );
      await dataSource.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/recovery`)
      .send({ recoveryCode: created.body.recovery.code })
      .expect(201);
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

    await request(app.getHttpServer())
      .put(
        `/api/v1/rooms/${roomId}/participants/${joined.body.participant.id}/conditions`
      )
      .set('Authorization', `Bearer ${joined.body.access.participantToken}`)
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
        candidateVersion: 1,
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
        candidateVersion: 1,
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

  it('updates and archives Candidates with PostgreSQL version conditions', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Candidate lifecycle integration room',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Candidate lifecycle host' },
      })
      .expect(201);
    roomId = created.body.room.id;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send(candidatePayload())
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .send({
        ...candidatePayload(),
        displayOrder: 2,
        time: {
          startsAt: '2026-09-01T14:00:00.000Z',
          endsAt: '2026-09-01T16:00:00.000Z',
          timezone: 'Asia/Seoul',
        },
      })
      .expect(201);

    const candidatePath = `/api/v1/rooms/${roomId}/candidates/${first.body.candidate.id}`;
    const updated = await request(app.getHttpServer())
      .patch(candidatePath)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 22000 })
      .expect(200);
    expect(updated.body.candidate).toMatchObject({
      id: first.body.candidate.id,
      version: 2,
      estimatedCostPerPersonKrw: 22000,
      status: CandidateStatus.ACTIVE,
    });

    const staleUpdate = await request(app.getHttpServer())
      .patch(candidatePath)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .send({ estimatedCostPerPersonKrw: 23000 })
      .expect(409);
    expect(staleUpdate.body.error.code).toBe('CANDIDATE_VERSION_CONFLICT');

    const archived = await request(app.getHttpServer())
      .delete(`/api/v1/rooms/${roomId}/candidates/${second.body.candidate.id}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .set('If-Match-Version', '1')
      .expect(200);
    expect(archived.body.candidate).toMatchObject({
      id: second.body.candidate.id,
      status: CandidateStatus.ARCHIVED,
      version: 2,
    });

    const persistedArchived = await dataSource
      .getRepository(Candidate)
      .findOneBy({ id: second.body.candidate.id });
    expect(persistedArchived).toMatchObject({
      status: CandidateStatus.ARCHIVED,
      version: 2,
    });

    const room = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${created.body.access.hostToken}`)
      .expect(200);
    expect(room.body.candidates).toHaveLength(1);
    expect(room.body.candidates[0]).toMatchObject({
      id: first.body.candidate.id,
      estimatedCostPerPersonKrw: 22000,
      version: 2,
    });
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

  it('returns 429 before PostgreSQL conditions, responses, credentials, ScoreResult or job mutations', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .send({
        title: 'Rate limit integration fixture',
        timezone: 'Asia/Seoul',
        host: { displayName: 'Rate host' },
      })
      .expect(201);
    roomId = created.body.room.id;
    const token = created.body.access.hostToken as string;
    const participantId = created.body.hostParticipant.id as string;
    for (const displayName of ['Rate member one', 'Rate member two']) {
      await request(app.getHttpServer())
        .post(`/api/v1/rooms/${created.body.room.roomCode}/participants`)
        .send({ displayName })
        .expect(201);
    }
    const firstCandidate = await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .auth(token, { type: 'bearer' })
      .send(candidatePayload())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${roomId}/candidates`)
      .auth(token, { type: 'bearer' })
      .send({
        ...candidatePayload(),
        displayOrder: 2,
        place: {
          name: 'Rate second place',
          address: 'Seoul second',
          area: 'Jung-gu',
        },
      })
      .expect(201);
    const limiter = app.get(RoomRateLimiter);
    for (const policy of [
      ROOM_LIMITS.condition,
      ROOM_LIMITS.response,
      ROOM_LIMITS.register,
    ]) {
      for (let i = 0; i < policy.maximum; i++)
        limiter.consume(policy, [roomId!, participantId]);
    }
    for (let i = 0; i < ROOM_LIMITS.calculation.maximum; i++)
      limiter.consume(ROOM_LIMITS.calculation, [roomId!]);
    const participantBefore = await dataSource
      .getRepository(Participant)
      .findOneByOrFail({ id: participantId });
    const roomBefore = await dataSource
      .getRepository(Room)
      .findOneByOrFail({ id: roomId! });
    const requests = [
      () =>
        request(app.getHttpServer())
          .put(
            `/api/v1/rooms/${roomId}/participants/${participantId}/conditions`
          )
          .auth(token, { type: 'bearer' })
          .send(validConditionPayload()),
      () =>
        request(app.getHttpServer())
          .put(
            `/api/v1/rooms/${roomId}/participants/${participantId}/responses/${firstCandidate.body.candidate.id}`
          )
          .auth(token, { type: 'bearer' })
          .send({
            candidateVersion: 1,
            availabilityStatus: 'AVAILABLE',
            travelBurden: 'EASY',
          }),
      () =>
        request(app.getHttpServer())
          .post(`/api/v1/rooms/${roomId}/recovery/register`)
          .auth(token, { type: 'bearer' })
          .send({ replace: true }),
      () =>
        request(app.getHttpServer())
          .post(`/api/v1/rooms/${roomId}/calculations`)
          .auth(token, { type: 'bearer' })
          .send({ clientRequestId: 'blocked-real-job' }),
    ];
    for (const pending of requests) {
      const response = await pending().expect(429);
      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.body.error.requestId).toMatch(/^req_/);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    for (const entity of [
      ParticipantCondition,
      ParticipantResponse,
      ScoreResult,
      CalculationJob,
    ]) {
      expect(
        await dataSource.getRepository(entity).countBy({ roomId: roomId! })
      ).toBe(0);
    }
    expect(
      await dataSource
        .getRepository(Participant)
        .findOneByOrFail({ id: participantId })
    ).toEqual(participantBefore);
    expect(
      await dataSource.getRepository(Room).findOneByOrFail({ id: roomId! })
    ).toEqual(roomBefore);
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${roomId}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
  });
});

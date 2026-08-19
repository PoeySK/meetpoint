import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Participant } from '../../infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../../infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from '../../infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from '../../infrastructure/persistence/typeorm/entities/participant-response.entity';
import { Room } from '../../infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from '../../infrastructure/persistence/typeorm/entities/score-result.entity';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../domain/participant/participant';
import { CandidateStatus } from '../../domain/candidate/candidate';
import { DecisionStatus } from '../../domain/decision/decision';
import {
  AvailabilityStatus,
  ParticipantResponseStatus,
  TravelBurden,
} from '../../domain/participant-response/participant-response';
import { RoomStatus } from '../../domain/room/room-status';
import { ScoreResultStatus } from '../../domain/calculation/score-result';
import { ConfirmDecisionUseCase } from './confirm-decision.use-case';
import { ReopenDecisionUseCase } from './reopen-decision.use-case';
import { GetDecisionQuery } from '../queries/get-decision.query';
import { TypeOrmRoomsPersistenceAdapter } from '../../infrastructure/persistence/typeorm/typeorm-rooms-persistence.adapter';
import { TypeOrmRoomAccessAdapter } from '../../infrastructure/persistence/typeorm/typeorm-room-access.adapter';
import { AccessTokenAdapter } from '../../infrastructure/security/access-token.adapter';
import {
  toCreateDecisionResponse,
  toDecisionResponse,
  toReopenDecisionResponse,
} from '../../presentation/http/view-models/decision-response';

type DecisionStore = {
  rooms: Map<string, Room>;
  participants: Map<string, Participant>;
  candidates: Map<string, Candidate>;
  responses: Map<string, ParticipantResponse>;
  scoreResults: Map<string, ScoreResult>;
  decisions: Map<string, Decision>;
  failDecisionSave: boolean;
  failRoomSave: boolean;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function matches(
  value: Record<string, unknown>,
  where: Record<string, unknown>
) {
  return Object.entries(where).every(
    ([key, expected]) => value[key] === expected
  );
}

function cloneStoreMap<T>(store: Map<string, T>) {
  return new Map(
    [...store.entries()].map(([id, value]) => [id, structuredClone(value)])
  );
}

function createRepository<T extends { id: string }>(
  store: Map<string, T>,
  options: {
    createValue: (attributes: Partial<T>) => T;
    beforeSave?: () => void;
  }
) {
  return {
    create(attributes: Partial<T>) {
      return options.createValue(attributes);
    },
    save(value: T) {
      options.beforeSave?.();
      const record = value as T & { createdAt?: Date; updatedAt?: Date };
      if (!record.createdAt) {
        record.createdAt = new Date();
      }
      if ('updatedAt' in record) {
        record.updatedAt = new Date();
      }
      store.set(value.id, value);
      return value;
    },
    findOne(optionsInput: { where?: Record<string, unknown> }) {
      const where = optionsInput?.where ?? {};
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    findOneBy(where: Record<string, unknown>) {
      return [...store.values()].find((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
    find(optionsInput: { where?: Record<string, unknown> }) {
      const where = optionsInput?.where ?? {};
      return [...store.values()].filter((value) =>
        matches(value as unknown as Record<string, unknown>, where)
      );
    },
  };
}

function createDecisionDataSource(store: DecisionStore) {
  const repositoryFor = (entity: unknown) => {
    if (entity === Room) {
      return createRepository(store.rooms, {
        createValue: (attributes) => Object.assign(new Room(), attributes),
        beforeSave: () => {
          if (store.failRoomSave) {
            throw new Error('room save failed');
          }
        },
      });
    }
    if (entity === Participant) {
      return createRepository(store.participants, {
        createValue: (attributes) =>
          Object.assign(new Participant(), attributes),
      });
    }
    if (entity === Candidate) {
      return createRepository(store.candidates, {
        createValue: (attributes) => Object.assign(new Candidate(), attributes),
      });
    }
    if (entity === ParticipantResponse) {
      return createRepository(store.responses, {
        createValue: (attributes) =>
          Object.assign(new ParticipantResponse(), attributes),
      });
    }
    if (entity === ScoreResult) {
      return createRepository(store.scoreResults, {
        createValue: (attributes) =>
          Object.assign(new ScoreResult(), attributes),
      });
    }
    if (entity === Decision) {
      return createRepository(store.decisions, {
        createValue: (attributes) => Object.assign(new Decision(), attributes),
        beforeSave: () => {
          if (store.failDecisionSave) {
            throw new Error('decision save failed');
          }
        },
      });
    }
    throw new Error('Unknown repository');
  };

  const dataSource = {
    getRepository: repositoryFor,
    transaction: async (
      callback: (manager: {
        getRepository: (entity: unknown) => unknown;
      }) => Promise<unknown>
    ) => {
      const snapshots = {
        rooms: cloneStoreMap(store.rooms),
        participants: cloneStoreMap(store.participants),
        candidates: cloneStoreMap(store.candidates),
        responses: cloneStoreMap(store.responses),
        scoreResults: cloneStoreMap(store.scoreResults),
        decisions: cloneStoreMap(store.decisions),
      };

      try {
        return await callback({ getRepository: repositoryFor });
      } catch (error) {
        for (const [name, snapshot] of Object.entries(snapshots)) {
          const target = store[name as keyof typeof snapshots] as Map<
            string,
            unknown
          >;
          target.clear();
          for (const [id, value] of snapshot as Map<string, unknown>) {
            target.set(id, value);
          }
        }
        throw error;
      }
    },
  };

  return dataSource as unknown as DataSource;
}

function createDecisionService(store: DecisionStore) {
  const dataSource = createDecisionDataSource(store);
  const persistence = new TypeOrmRoomsPersistenceAdapter(dataSource);
  const access = new TypeOrmRoomAccessAdapter(
    dataSource,
    new AccessTokenAdapter()
  );
  const confirm = new ConfirmDecisionUseCase(persistence, access);
  const reopen = new ReopenDecisionUseCase(persistence, access);
  const get = new GetDecisionQuery(persistence, access);
  return {
    createDecision: async (
      ...args: Parameters<ConfirmDecisionUseCase['execute']>
    ) => toCreateDecisionResponse(await confirm.execute(...args)),
    reopenDecision: async (
      ...args: Parameters<ReopenDecisionUseCase['execute']>
    ) => toReopenDecisionResponse(await reopen.execute(...args)),
    getDecision: async (...args: Parameters<GetDecisionQuery['execute']>) =>
      toDecisionResponse(await get.execute(...args)),
  };
}

function createSeed(): {
  store: DecisionStore;
  roomId: string;
  hostToken: string;
  memberToken: string;
  candidateIds: string[];
  scoreResultId: string;
} {
  const roomId = 'room-decision';
  const hostToken = 'host-token';
  const memberToken = 'member-token';
  const scoreResultId = 'score-1';
  const now = new Date();
  const store: DecisionStore = {
    rooms: new Map(),
    participants: new Map(),
    candidates: new Map(),
    responses: new Map(),
    scoreResults: new Map(),
    decisions: new Map(),
    failDecisionSave: false,
    failRoomSave: false,
  };

  store.rooms.set(
    roomId,
    Object.assign(new Room(), {
      id: roomId,
      roomCode: 'DEC001',
      title: 'Decision room',
      timezone: 'Asia/Seoul',
      status: RoomStatus.CALCULATED,
      hostParticipantId: 'participant-host',
      maxParticipants: 6,
      latestScoreResultId: scoreResultId,
      currentDecisionId: null,
      createdAt: now,
      updatedAt: now,
    })
  );

  for (const [id, role, token] of [
    ['participant-host', ParticipantRole.HOST, hostToken],
    ['participant-member-1', ParticipantRole.MEMBER, memberToken],
    ['participant-member-2', ParticipantRole.MEMBER, 'member-token-2'],
  ] as const) {
    store.participants.set(
      id,
      Object.assign(new Participant(), {
        id,
        roomId,
        displayName: id,
        role,
        status: ParticipantStatus.JOINED,
        tokenHash: hashToken(token),
        tokenExpiresAt: new Date(Date.now() + 60_000),
        tokenRevokedAt: null,
        joinedAt: now,
        updatedAt: now,
      })
    );
  }

  const candidateIds = ['candidate-1', 'candidate-2'];
  for (const [index, id] of candidateIds.entries()) {
    store.candidates.set(
      id,
      Object.assign(new Candidate(), {
        id,
        roomId,
        displayOrder: index + 1,
        time: {
          startsAt: `2026-09-01T${index === 0 ? '10:00:00' : '14:00:00'}.000Z`,
          endsAt: `2026-09-01T${index === 0 ? '12:00:00' : '16:00:00'}.000Z`,
          timezone: 'Asia/Seoul',
        },
        place: { name: id, address: 'Address', area: 'Area' },
        estimatedCostPerPersonKrw: 15000,
        tags: [],
        status: CandidateStatus.ACTIVE,
        version: 1,
        archivedAt: null,
        createdByParticipantId: 'participant-host',
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  for (const participantId of store.participants.keys()) {
    for (const candidateId of candidateIds) {
      store.responses.set(
        `${participantId}-${candidateId}`,
        Object.assign(new ParticipantResponse(), {
          id: `${participantId}-${candidateId}`,
          roomId,
          participantId,
          candidateId,
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          travelBurden: TravelBurden.EASY,
          note: null,
          status: ParticipantResponseStatus.SUBMITTED,
          submittedAt: now,
          updatedAt: now,
        })
      );
    }
  }

  store.scoreResults.set(
    scoreResultId,
    Object.assign(new ScoreResult(), {
      id: scoreResultId,
      roomId,
      clientRequestId: 'client-1',
      status: ScoreResultStatus.COMPLETED,
      policyVersion: 'mvp-1',
      scoringProfile: 'MVP_NO_CONDITIONS',
      inputSnapshotHash: 'sha256:test',
      participantCount: 3,
      candidateCount: 2,
      coverage: {
        respondedParticipants: 3,
        totalParticipants: 3,
        submittedResponses: 6,
        expectedResponses: 6,
      },
      recommendationStatus: 'FULL_MATCH',
      recommendationWarnings: [],
      ranking: candidateIds,
      candidates: candidateIds.map((candidateId, index) => ({
        candidateId,
        rank: index + 1,
        overallScore: index === 0 ? 95 : 80,
        eligible: true,
        matchLevel: 'FULL',
        hardConflictCount: 0,
        coverage: { submittedResponses: 3, expectedResponses: 3 },
        participantBreakdown: [],
        reasons: ['모든 응답 완료'],
        conflicts: [],
        blockingIssues: [],
        explanationFlags: [],
      })),
      metadata: {
        scoringProfile: 'MVP_NO_CONDITIONS',
        weights: { time: 40, travelBurden: 25, budget: 20, preference: 15 },
      },
      error: null,
      createdAt: now,
      completedAt: now,
    })
  );

  return { store, roomId, hostToken, memberToken, candidateIds, scoreResultId };
}

async function expectCode(
  action: () => Promise<unknown>,
  exception: new (...args: never[]) => Error,
  code: string
) {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(exception);
  expect(
    (thrown as { getResponse: () => unknown }).getResponse()
  ).toMatchObject({
    message: code,
  });
}

describe('DecisionService vertical slice', () => {
  it('confirms a manually selected candidate from the latest completed result', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);

    const response = await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });

    expect(response.roomStatus).toBe(RoomStatus.CONFIRMED);
    expect(response.decision).toMatchObject({
      roomId: seed.roomId,
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      decidedByParticipantId: 'participant-host',
      status: DecisionStatus.CONFIRMED,
      decisionNote: null,
      replacedDecisionId: null,
    });
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(
      RoomStatus.CONFIRMED
    );
    expect(seed.store.rooms.get(seed.roomId)?.currentDecisionId).toBe(
      response.decision.id
    );
  });

  it('allows MEMBER read access but rejects MEMBER confirmation and cross-room tokens', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.memberToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      ForbiddenException,
      'HOST_ONLY'
    );

    await expectCode(
      () => service.getDecision(seed.roomId, seed.memberToken),
      NotFoundException,
      'DECISION_NOT_FOUND'
    );

    const otherRoom = 'other-room';
    Object.assign(seed.store.rooms.get(seed.roomId), { id: otherRoom });
    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      NotFoundException,
      'RESOURCE_NOT_FOUND'
    );
  });

  it.each([
    [
      'room state',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.rooms.get(seed.roomId)!.status = RoomStatus.OPEN;
      },
      'ROOM_STATE_CONFLICT',
    ],
    [
      'old latest result',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.rooms.get(seed.roomId)!.latestScoreResultId = 'other-score';
      },
      'STALE_RESULT',
    ],
    [
      'failed result',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.scoreResults.get(seed.scoreResultId)!.status =
          ScoreResultStatus.FAILED;
      },
      'STALE_RESULT',
    ],
    [
      'stale result',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.scoreResults.get(seed.scoreResultId)!.status =
          ScoreResultStatus.STALE;
      },
      'STALE_RESULT',
    ],
  ])('rejects confirmation for %s', async (_label, prepare, code) => {
    const seed = createSeed();
    prepare(seed);
    const service = createDecisionService(seed.store);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      code === 'ROOM_STATE_CONFLICT' ? ConflictException : ConflictException,
      code
    );
  });

  it('rejects incomplete coverage and missing active responses without filling them', async () => {
    const seed = createSeed();
    seed.store.responses.delete('participant-member-2-candidate-2');
    seed.store.scoreResults.get(
      seed.scoreResultId
    )!.coverage.submittedResponses = 5;
    const service = createDecisionService(seed.store);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      UnprocessableEntityException,
      'BUSINESS_RULE_VIOLATION'
    );
    expect(seed.store.responses.has('participant-member-2-candidate-2')).toBe(
      false
    );
  });

  it.each([
    [
      'missing score result',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.scoreResults.clear();
      },
      NotFoundException,
      'SCORE_RESULT_NOT_FOUND',
    ],
    [
      'candidate projection mismatch',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.scoreResults.get(seed.scoreResultId)!.candidates = [];
      },
      ConflictException,
      'STALE_RESULT',
    ],
    [
      'participant count changed after calculation',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.participants.get('participant-member-2')!.status =
          ParticipantStatus.LEFT;
      },
      ConflictException,
      'STALE_RESULT',
    ],
    [
      'active candidate count changed after calculation',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.candidates.set(
          'candidate-3',
          Object.assign(new Candidate(), {
            id: 'candidate-3',
            roomId: seed.roomId,
            status: CandidateStatus.ACTIVE,
          })
        );
      },
      ConflictException,
      'STALE_RESULT',
    ],
    [
      'archived selected candidate',
      (seed: ReturnType<typeof createSeed>) => {
        seed.store.candidates.get(seed.candidateIds[0])!.status =
          CandidateStatus.ARCHIVED;
        const scoreResult = seed.store.scoreResults.get(seed.scoreResultId)!;
        scoreResult.candidateCount = 1;
        scoreResult.coverage = {
          respondedParticipants: 3,
          totalParticipants: 3,
          submittedResponses: 3,
          expectedResponses: 3,
        };
        scoreResult.candidates = [scoreResult.candidates[0]];
      },
      UnprocessableEntityException,
      'BUSINESS_RULE_VIOLATION',
    ],
  ])(
    'rejects confirmation when %s',
    async (_label, prepare, exception, code) => {
      const seed = createSeed();
      prepare(seed);
      const service = createDecisionService(seed.store);

      await expectCode(
        () =>
          service.createDecision(seed.roomId, seed.hostToken, {
            candidateId: seed.candidateIds[0],
            scoreResultId: seed.scoreResultId,
            acknowledgeIssues: false,
          }),
        exception,
        code
      );
    }
  );

  it('rejects a candidate or score result from another Room and duplicate confirmation', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);
    const foreignCandidate = Object.assign(new Candidate(), {
      id: 'foreign-candidate',
      roomId: 'foreign-room',
      status: CandidateStatus.ACTIVE,
    });
    seed.store.candidates.set(foreignCandidate.id, foreignCandidate);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: foreignCandidate.id,
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      NotFoundException,
      'RESOURCE_NOT_FOUND'
    );

    const foreignScore = structuredClone(
      seed.store.scoreResults.get(seed.scoreResultId)!
    );
    foreignScore.id = 'foreign-score';
    foreignScore.roomId = 'foreign-room';
    seed.store.scoreResults.set(foreignScore.id, foreignScore);
    seed.store.rooms.get(seed.roomId)!.latestScoreResultId = foreignScore.id;
    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: foreignScore.id,
          acknowledgeIssues: false,
        }),
      NotFoundException,
      'RESOURCE_NOT_FOUND'
    );

    seed.store.rooms.get(seed.roomId)!.latestScoreResultId = seed.scoreResultId;
    await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });
    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[1],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      ConflictException,
      'ROOM_STATE_CONFLICT'
    );
  });

  it('requires issue acknowledgement and a note only for an issue candidate', async () => {
    const seed = createSeed();
    const score = seed.store.scoreResults.get(seed.scoreResultId)!;
    score.candidates[0].matchLevel = 'PARTIAL';
    score.recommendationWarnings = ['LOW_SCORE'];
    const service = createDecisionService(seed.store);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
        }),
      UnprocessableEntityException,
      'BUSINESS_RULE_VIOLATION'
    );

    const confirmed = await service.createDecision(
      seed.roomId,
      seed.hostToken,
      {
        candidateId: seed.candidateIds[0],
        scoreResultId: seed.scoreResultId,
        acknowledgeIssues: true,
        decisionNote: '  이슈를 확인하고 확정합니다.  ',
      }
    );
    expect(confirmed.decision.decisionNote).toBe('이슈를 확인하고 확정합니다.');
  });

  it('validates decision and reopen note lengths', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);

    await expectCode(
      () =>
        service.createDecision(seed.roomId, seed.hostToken, {
          candidateId: seed.candidateIds[0],
          scoreResultId: seed.scoreResultId,
          acknowledgeIssues: false,
          decisionNote: 'x'.repeat(301),
        }),
      BadRequestException,
      'VALIDATION_ERROR'
    );

    await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });
    await expectCode(
      () => service.reopenDecision(seed.roomId, seed.hostToken, { reason: '' }),
      BadRequestException,
      'VALIDATION_ERROR'
    );
    await expectCode(
      () =>
        service.reopenDecision(seed.roomId, seed.hostToken, {
          reason: 'x'.repeat(301),
        }),
      BadRequestException,
      'VALIDATION_ERROR'
    );
  });

  it('returns the persisted candidate projection and overall score, including an archived candidate', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);
    await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });
    seed.store.candidates.get(seed.candidateIds[0])!.status =
      CandidateStatus.ARCHIVED;

    const response = await service.getDecision(seed.roomId, seed.memberToken);
    expect(response.decision).toMatchObject({
      id: seed.store.rooms.get(seed.roomId)!.currentDecisionId,
      status: DecisionStatus.CONFIRMED,
      candidate: {
        id: seed.candidateIds[0],
        status: CandidateStatus.ARCHIVED,
      },
      overallScore: 95,
    });
  });

  it('reopens a confirmation, preserves it, and supersedes it on the next confirmation', async () => {
    const seed = createSeed();
    const service = createDecisionService(seed.store);
    const first = await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });

    const reopened = await service.reopenDecision(seed.roomId, seed.hostToken, {
      reason: '장소 정보를 다시 확인해야 합니다',
    });
    expect(reopened.decision.status).toBe(DecisionStatus.REOPENED);
    expect(seed.store.rooms.get(seed.roomId)?.status).toBe(RoomStatus.OPEN);
    expect(seed.store.decisions.get(first.decision.id)?.status).toBe(
      DecisionStatus.REOPENED
    );

    const reopenedProjection = await service.getDecision(
      seed.roomId,
      seed.memberToken
    );
    expect(reopenedProjection.decision).toMatchObject({
      id: first.decision.id,
      status: DecisionStatus.REOPENED,
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      reopenReason: '장소 정보를 다시 확인해야 합니다',
      overallScore: 95,
    });

    const nextScoreId = 'score-2';
    const nextScore = structuredClone(
      seed.store.scoreResults.get(seed.scoreResultId)!
    );
    nextScore.id = nextScoreId;
    seed.store.scoreResults.set(nextScoreId, nextScore);
    seed.store.rooms.get(seed.roomId)!.latestScoreResultId = nextScoreId;
    seed.store.rooms.get(seed.roomId)!.status = RoomStatus.CALCULATED;
    const second = await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[1],
      scoreResultId: nextScoreId,
      acknowledgeIssues: false,
    });

    expect(seed.store.decisions.get(first.decision.id)?.status).toBe(
      DecisionStatus.SUPERSEDED
    );
    expect(second.decision.replacedDecisionId).toBe(first.decision.id);
    expect(seed.store.rooms.get(seed.roomId)?.currentDecisionId).toBe(
      second.decision.id
    );
  });

  it('allows only the current HOST to reopen and does not reopen an absent or already reopened decision', async () => {
    const noDecision = createSeed();
    const noDecisionService = createDecisionService(noDecision.store);
    await expectCode(
      () =>
        noDecisionService.reopenDecision(
          noDecision.roomId,
          noDecision.hostToken,
          {
            reason: '재검토 사유',
          }
        ),
      ConflictException,
      'ROOM_STATE_CONFLICT'
    );

    const seed = createSeed();
    const service = createDecisionService(seed.store);
    await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });
    await expectCode(
      () =>
        service.reopenDecision(seed.roomId, seed.memberToken, {
          reason: '사유',
        }),
      ForbiddenException,
      'HOST_ONLY'
    );
    await service.reopenDecision(seed.roomId, seed.hostToken, {
      reason: '첫 번째 재검토',
    });
    await expectCode(
      () =>
        service.reopenDecision(seed.roomId, seed.hostToken, {
          reason: '두 번째 재검토',
        }),
      ConflictException,
      'ROOM_STATE_CONFLICT'
    );

    const inconsistent = createSeed();
    const inconsistentService = createDecisionService(inconsistent.store);
    await inconsistentService.createDecision(
      inconsistent.roomId,
      inconsistent.hostToken,
      {
        candidateId: inconsistent.candidateIds[0],
        scoreResultId: inconsistent.scoreResultId,
        acknowledgeIssues: false,
      }
    );
    inconsistent.store.rooms.get(inconsistent.roomId)!.status = RoomStatus.OPEN;
    await expectCode(
      () =>
        inconsistentService.reopenDecision(
          inconsistent.roomId,
          inconsistent.hostToken,
          {
            reason: '상태 불일치 재검토',
          }
        ),
      ConflictException,
      'ROOM_STATE_CONFLICT'
    );
  });

  it('does not expose a Decision to a token from another Room', async () => {
    const seed = createSeed();
    const otherParticipant = Object.assign(new Participant(), {
      id: 'foreign-participant',
      roomId: 'foreign-room',
      role: ParticipantRole.MEMBER,
      status: ParticipantStatus.JOINED,
      tokenHash: hashToken('foreign-token'),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      tokenRevokedAt: null,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });
    seed.store.participants.set(otherParticipant.id, otherParticipant);
    const service = createDecisionService(seed.store);

    await service.createDecision(seed.roomId, seed.hostToken, {
      candidateId: seed.candidateIds[0],
      scoreResultId: seed.scoreResultId,
      acknowledgeIssues: false,
    });
    await expectCode(
      () => service.getDecision(seed.roomId, 'foreign-token'),
      NotFoundException,
      'RESOURCE_NOT_FOUND'
    );
  });

  it('rolls back Decision and Room changes when either save fails', async () => {
    const decisionFailure = createSeed();
    decisionFailure.store.failDecisionSave = true;
    const decisionService = createDecisionService(decisionFailure.store);
    await expect(
      decisionService.createDecision(
        decisionFailure.roomId,
        decisionFailure.hostToken,
        {
          candidateId: decisionFailure.candidateIds[0],
          scoreResultId: decisionFailure.scoreResultId,
          acknowledgeIssues: false,
        }
      )
    ).rejects.toThrow('decision save failed');
    expect(decisionFailure.store.decisions.size).toBe(0);
    expect(
      decisionFailure.store.rooms.get(decisionFailure.roomId)?.status
    ).toBe(RoomStatus.CALCULATED);

    const roomFailure = createSeed();
    roomFailure.store.failRoomSave = true;
    const roomService = createDecisionService(roomFailure.store);
    await expect(
      roomService.createDecision(roomFailure.roomId, roomFailure.hostToken, {
        candidateId: roomFailure.candidateIds[0],
        scoreResultId: roomFailure.scoreResultId,
        acknowledgeIssues: false,
      })
    ).rejects.toThrow('room save failed');
    expect(roomFailure.store.decisions.size).toBe(0);
    expect(roomFailure.store.rooms.get(roomFailure.roomId)?.status).toBe(
      RoomStatus.CALCULATED
    );
  });
});

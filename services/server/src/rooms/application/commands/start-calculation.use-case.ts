import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  ParticipantRole,
  isActiveParticipant,
} from '../../domain/participant/participant';
import {
  ScoreResultStatus,
  type ScoreResultRecord,
} from '../../domain/calculation/score-result';
import { RoomStatus } from '../../domain/room/room-status';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { SOLVER, type SolverPort } from '../ports/solver.port';
import {
  type SolverResponsePayload,
  SolverCallError,
  type SolverSnapshot,
} from '../ports/solver-contract';
import {
  CALCULATION_POLICY_VERSION,
  CALCULATION_SCORING_PROFILE,
  createScoringMetadata,
} from '../../domain/calculation/calculation-policy';
import {
  createInitialCoverage,
  createSolverSnapshot,
} from './calculation-snapshot';

@Injectable()
export class StartCalculationUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort,
    @Inject(SOLVER) private readonly solver: SolverPort
  ) {}

  async execute(
    roomId: string,
    accessToken: string | undefined,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const clientRequestId = this.validateClientRequestId(input);
    const requestId = `req_${randomUUID()}`;
    const prepared = await this.persistence.transaction(
      async (repositories) => {
        const {
          rooms,
          participants,
          candidates,
          responses,
          conditions,
          scoreResults,
        } = repositories;
        const room = await rooms.findById(roomId, { lock: true });
        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const existing = await scoreResults.findByRoomAndClientRequestId(
          roomId,
          clientRequestId
        );
        if (existing) {
          return { scoreResult: existing, snapshot: undefined };
        }
        if (room.status === RoomStatus.CALCULATING) {
          throw new ConflictException('CALCULATION_IN_PROGRESS');
        }
        if (
          room.status !== RoomStatus.OPEN &&
          room.status !== RoomStatus.CALCULATED
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const activeParticipants = (
          await participants.findByRoomId(room.id)
        ).filter(isActiveParticipant);
        if (activeParticipants.length < 3 || activeParticipants.length > 6) {
          throw new UnprocessableEntityException(
            'PARTICIPANT_COUNT_OUT_OF_RANGE'
          );
        }

        const activeCandidates = await candidates.findByRoomId(room.id, {
          activeOnly: true,
          ordered: true,
        });
        if (activeCandidates.length < 2 || activeCandidates.length > 5) {
          throw new UnprocessableEntityException('NO_ACTIVE_CANDIDATES');
        }

        const participantConditions = await conditions.findByRoomId(room.id);
        const snapshot = createSolverSnapshot(
          requestId,
          room,
          activeParticipants,
          activeCandidates,
          await responses.findByRoomId(room.id),
          participantConditions,
          CALCULATION_POLICY_VERSION,
          CALCULATION_SCORING_PROFILE
        );
        const scoreResult: ScoreResultRecord = {
          id: randomUUID(),
          roomId: room.id,
          clientRequestId,
          status: ScoreResultStatus.RUNNING,
          policyVersion: CALCULATION_POLICY_VERSION,
          scoringProfile: CALCULATION_SCORING_PROFILE,
          inputSnapshotHash: this.createSnapshotHash(snapshot),
          participantCount: activeParticipants.length,
          candidateCount: activeCandidates.length,
          coverage: createInitialCoverage(snapshot),
          recommendationStatus: null,
          recommendationWarnings: [],
          ranking: [],
          candidates: [],
          metadata: createScoringMetadata(),
          error: null,
          createdAt: new Date(),
          completedAt: null,
        };

        await rooms.save({
          ...room,
          status: RoomStatus.CALCULATING,
          latestScoreResultId: scoreResult.id,
          updatedAt: new Date(),
        });
        const savedScoreResult = await scoreResults.save(scoreResult);
        return { scoreResult: savedScoreResult, snapshot };
      }
    );

    if (prepared.snapshot) {
      void this.executeCalculation(
        prepared.scoreResult.id,
        roomId,
        prepared.snapshot
      );
    }

    return {
      requestId,
      scoreResult: prepared.scoreResult,
    };
  }

  private validateClientRequestId(input: unknown): string {
    const candidate = input as
      | {
          clientRequestId?: unknown;
        }
      | null
      | undefined;
    const clientRequestId =
      typeof candidate?.clientRequestId === 'string'
        ? candidate.clientRequestId.trim()
        : '';
    if (!clientRequestId || clientRequestId.length > 128) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return clientRequestId;
  }

  private createSnapshotHash(snapshot: SolverSnapshot): string {
    return `sha256:${createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex')}`;
  }

  private async executeCalculation(
    scoreResultId: string,
    roomId: string,
    snapshot: SolverSnapshot
  ): Promise<void> {
    try {
      const solverResponse = await this.solver.solve(snapshot);
      await this.completeCalculation(scoreResultId, roomId, solverResponse);
    } catch (error) {
      const failure =
        error instanceof SolverCallError
          ? error
          : new SolverCallError(
              'SOLVER_ERROR',
              'Solver returned an invalid response.',
              false,
              {}
            );
      await this.failCalculation(scoreResultId, roomId, failure);
    }
  }

  private async completeCalculation(
    scoreResultId: string,
    roomId: string,
    response: SolverResponsePayload
  ): Promise<void> {
    await this.persistence.transaction(async ({ rooms, scoreResults }) => {
      const scoreResult = await scoreResults.findById(scoreResultId, {
        lock: true,
      });
      if (!scoreResult || scoreResult.status !== ScoreResultStatus.RUNNING) {
        return;
      }

      const completed = {
        ...scoreResult,
        status: ScoreResultStatus.COMPLETED,
        recommendationStatus: response.recommendationStatus,
        recommendationWarnings: response.recommendationWarnings,
        coverage: response.coverage,
        ranking: response.ranking,
        candidates: response.candidates,
        metadata: response.metadata,
        error: null,
        completedAt: new Date(),
      } satisfies ScoreResultRecord;
      await scoreResults.save(completed);

      const room = await rooms.findById(roomId);
      if (
        room &&
        room.status === RoomStatus.CALCULATING &&
        room.latestScoreResultId === scoreResult.id
      ) {
        await rooms.save({
          ...room,
          status: RoomStatus.CALCULATED,
          updatedAt: new Date(),
        });
      }
    });
  }

  private async failCalculation(
    scoreResultId: string,
    roomId: string,
    error: SolverCallError
  ): Promise<void> {
    await this.persistence.transaction(async ({ rooms, scoreResults }) => {
      const scoreResult = await scoreResults.findById(scoreResultId, {
        lock: true,
      });
      if (!scoreResult || scoreResult.status !== ScoreResultStatus.RUNNING) {
        return;
      }

      await scoreResults.save({
        ...scoreResult,
        status: ScoreResultStatus.FAILED,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details,
        },
        completedAt: new Date(),
      });

      const room = await rooms.findById(roomId);
      if (
        room &&
        room.status === RoomStatus.CALCULATING &&
        room.latestScoreResultId === scoreResult.id
      ) {
        await rooms.save({
          ...room,
          status: RoomStatus.OPEN,
          updatedAt: new Date(),
        });
      }
    });
  }
}

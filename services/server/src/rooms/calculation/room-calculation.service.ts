import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../../participants/entities/participant.entity';
import { StartCalculationDto } from '../dto/start-calculation.dto';
import { Candidate, CandidateStatus } from '../entities/candidate.entity';
import { ParticipantResponse } from '../entities/participant-response.entity';
import { Room, RoomStatus } from '../entities/room.entity';
import {
  ScoreResult,
  ScoreResultStatus,
} from '../entities/score-result.entity';
import { getAuthorizedParticipant } from '../room-access';
import {
  CalculationResponse,
  LatestScoreResultResponse,
  StartCalculationResponse,
  createRequestId,
  createScoringMetadata,
  toCalculationPayload,
  toCalculationSummary,
} from '../room-response';
import {
  CALCULATION_POLICY_VERSION,
  CALCULATION_SCORING_PROFILE,
} from './calculation-policy';
import {
  createInitialCoverage,
  createSolverSnapshot,
  SolverCallError,
  SolverClient,
  type SolverResponsePayload,
  type SolverSnapshot,
} from './solver-client';

export class RoomCalculationService {
  private readonly solverClient = new SolverClient();

  constructor(private readonly dataSource: DataSource) {}

  async startCalculation(
    roomId: string,
    accessToken: string | undefined,
    input: StartCalculationDto
  ): Promise<StartCalculationResponse> {
    const actor = await this.getAuthorizedParticipant(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const clientRequestId = this.validateClientRequestId(input);
    const requestId = createRequestId();
    const prepared = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const candidateRepository = manager.getRepository(Candidate);
        const responseRepository = manager.getRepository(ParticipantResponse);
        const scoreResultRepository = manager.getRepository(ScoreResult);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const existing = await scoreResultRepository.findOne({
          where: { roomId, clientRequestId },
        });
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

        const participants = await participantRepository.find({
          where: { roomId: room.id },
          order: { joinedAt: 'ASC' },
        });
        const activeParticipants = participants.filter(
          (participant) =>
            participant.status !== ParticipantStatus.LEFT &&
            participant.status !== ParticipantStatus.REMOVED
        );
        if (activeParticipants.length < 3 || activeParticipants.length > 6) {
          throw new UnprocessableEntityException(
            'PARTICIPANT_COUNT_OUT_OF_RANGE'
          );
        }

        const allCandidates = await candidateRepository.find({
          where: { roomId: room.id, status: CandidateStatus.ACTIVE },
          order: { displayOrder: 'ASC', createdAt: 'ASC', id: 'ASC' },
        });
        if (allCandidates.length < 2 || allCandidates.length > 5) {
          throw new UnprocessableEntityException('NO_ACTIVE_CANDIDATES');
        }

        const responses = await responseRepository.find({
          where: { roomId: room.id },
        });
        const snapshot = createSolverSnapshot(
          requestId,
          room,
          activeParticipants,
          allCandidates,
          responses,
          CALCULATION_POLICY_VERSION,
          CALCULATION_SCORING_PROFILE
        );
        const scoreResult = scoreResultRepository.create({
          id: randomUUID(),
          roomId: room.id,
          clientRequestId,
          status: ScoreResultStatus.RUNNING,
          policyVersion: CALCULATION_POLICY_VERSION,
          scoringProfile: CALCULATION_SCORING_PROFILE,
          inputSnapshotHash: this.createSnapshotHash(snapshot),
          participantCount: activeParticipants.length,
          candidateCount: allCandidates.length,
          coverage: createInitialCoverage(snapshot),
          recommendationStatus: null,
          recommendationWarnings: [],
          ranking: [],
          candidates: [],
          metadata: createScoringMetadata(),
          error: null,
          completedAt: null,
        });

        room.status = RoomStatus.CALCULATING;
        room.latestScoreResultId = scoreResult.id;
        await roomRepository.save(room);
        const savedScoreResult = await scoreResultRepository.save(scoreResult);

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
      calculation: toCalculationSummary(prepared.scoreResult),
      pollUrl: `/api/v1/rooms/${encodeURIComponent(roomId)}/calculations/${encodeURIComponent(prepared.scoreResult.id)}`,
    };
  }

  async getCalculation(
    roomId: string,
    calculationId: string,
    accessToken: string | undefined
  ): Promise<CalculationResponse> {
    await this.getAuthorizedParticipant(roomId, accessToken);
    const scoreResult = await this.dataSource
      .getRepository(ScoreResult)
      .findOneBy({ id: calculationId, roomId });

    if (!scoreResult) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    return {
      requestId: createRequestId(),
      calculation: toCalculationPayload(scoreResult),
    };
  }

  async getLatestScoreResult(
    roomId: string,
    accessToken: string | undefined
  ): Promise<LatestScoreResultResponse> {
    const { room } = await this.getAuthorizedParticipant(roomId, accessToken);
    const scoreResultRepository = this.dataSource.getRepository(ScoreResult);
    const scoreResult = room.latestScoreResultId
      ? await scoreResultRepository.findOneBy({
          id: room.latestScoreResultId,
          roomId,
        })
      : await scoreResultRepository.findOne({
          where: { roomId },
          order: { createdAt: 'DESC' },
        });

    if (!scoreResult) {
      throw new NotFoundException('SCORE_RESULT_NOT_FOUND');
    }

    return {
      requestId: createRequestId(),
      scoreResult: toCalculationPayload(scoreResult),
    };
  }

  private validateClientRequestId(input: StartCalculationDto): string {
    const clientRequestId =
      typeof input?.clientRequestId === 'string'
        ? input.clientRequestId.trim()
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
      const solverResponse = await this.solverClient.call(snapshot);
      this.solverClient.validateResponse(snapshot, solverResponse);
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
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const roomRepository = manager.getRepository(Room);
      const scoreResultRepository = manager.getRepository(ScoreResult);
      const scoreResult = await scoreResultRepository.findOne({
        where: { id: scoreResultId, roomId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!scoreResult || scoreResult.status !== ScoreResultStatus.RUNNING) {
        return;
      }

      scoreResult.status = ScoreResultStatus.COMPLETED;
      scoreResult.recommendationStatus = response.recommendationStatus;
      scoreResult.recommendationWarnings = response.recommendationWarnings;
      scoreResult.coverage = response.coverage;
      scoreResult.ranking = response.ranking;
      scoreResult.candidates = response.candidates;
      scoreResult.metadata = response.metadata;
      scoreResult.error = null;
      scoreResult.completedAt = new Date();
      await scoreResultRepository.save(scoreResult);

      const room = await roomRepository.findOneBy({ id: roomId });
      if (
        room &&
        room.status === RoomStatus.CALCULATING &&
        room.latestScoreResultId === scoreResult.id
      ) {
        room.status = RoomStatus.CALCULATED;
        await roomRepository.save(room);
      }
    });
  }

  private async failCalculation(
    scoreResultId: string,
    roomId: string,
    error: SolverCallError
  ): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const roomRepository = manager.getRepository(Room);
      const scoreResultRepository = manager.getRepository(ScoreResult);
      const scoreResult = await scoreResultRepository.findOne({
        where: { id: scoreResultId, roomId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!scoreResult || scoreResult.status !== ScoreResultStatus.RUNNING) {
        return;
      }

      scoreResult.status = ScoreResultStatus.FAILED;
      scoreResult.error = {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
      };
      scoreResult.completedAt = new Date();
      await scoreResultRepository.save(scoreResult);

      const room = await roomRepository.findOneBy({ id: roomId });
      if (
        room &&
        room.status === RoomStatus.CALCULATING &&
        room.latestScoreResultId === scoreResult.id
      ) {
        room.status = RoomStatus.OPEN;
        await roomRepository.save(room);
      }
    });
  }

  private async getAuthorizedParticipant(
    roomId: string,
    accessToken?: string
  ): Promise<{ room: Room; participant: Participant }> {
    return getAuthorizedParticipant(this.dataSource, roomId, accessToken);
  }
}

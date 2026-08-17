import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { ReopenDecisionDto } from './dto/reopen-decision.dto';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import {
  ParticipantResponse,
  ParticipantResponseStatus,
} from './entities/participant-response.entity';
import { Decision, DecisionStatus } from './entities/decision.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { ScoreResult, ScoreResultStatus } from './entities/score-result.entity';
import { getAuthorizedParticipant } from './room-access';
import { toCandidatePayload } from './room-payload';
import type { CandidatePayload } from './room-payload';

type NormalizedCreateDecisionInput = {
  candidateId: string;
  scoreResultId: string;
  acknowledgeIssues: boolean;
  decisionNote: string | null;
};

type DecisionConfirmationContext = {
  candidate: Candidate;
  scoreResult: ScoreResult;
  previousDecision: Decision | null;
};

export interface DecisionPayload {
  id: string;
  roomId: string;
  candidateId: string;
  scoreResultId: string;
  decidedByParticipantId: string;
  status: DecisionStatus;
  acknowledgeIssues: boolean;
  decisionNote: string | null;
  confirmedAt: Date;
  replacedDecisionId: string | null;
  reopenedAt: Date | null;
  reopenReason: string | null;
}

export interface DecisionProjection extends DecisionPayload {
  candidate: CandidatePayload;
  overallScore: number;
}

export interface CreateDecisionResponse {
  requestId: string;
  decision: DecisionPayload;
  roomStatus: RoomStatus.CONFIRMED;
}

export interface ReopenDecisionResponse {
  requestId: string;
  decision: DecisionPayload;
  roomStatus: RoomStatus.OPEN;
  nextStep: 'CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE';
}

export interface DecisionResponse {
  requestId: string;
  decision: DecisionProjection;
}

@Injectable()
export class DecisionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createDecision(
    roomId: string,
    accessToken: string | undefined,
    input: CreateDecisionDto
  ): Promise<CreateDecisionResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const normalizedInput = this.validateCreateDecisionInput(input);
    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const decisionRepository = manager.getRepository(Decision);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const currentParticipant = await participantRepository.findOneBy({
          id: actor.participant.id,
        });
        if (
          !currentParticipant ||
          currentParticipant.roomId !== room.id ||
          currentParticipant.role !== ParticipantRole.HOST ||
          currentParticipant.id !== room.hostParticipantId
        ) {
          throw new ForbiddenException('HOST_ONLY');
        }

        const context = await this.assertDecisionCanBeConfirmed(
          manager,
          room,
          normalizedInput
        );

        const decision = decisionRepository.create({
          id: randomUUID(),
          roomId: room.id,
          candidateId: context.candidate.id,
          scoreResultId: context.scoreResult.id,
          decidedByParticipantId: currentParticipant.id,
          status: DecisionStatus.CONFIRMED,
          acknowledgeIssues: normalizedInput.acknowledgeIssues,
          decisionNote: normalizedInput.decisionNote,
          confirmedAt: new Date(),
          replacedDecisionId: context.previousDecision?.id ?? null,
          reopenedAt: null,
          reopenReason: null,
        });
        const savedDecision = await decisionRepository.save(decision);

        if (context.previousDecision) {
          context.previousDecision.status = DecisionStatus.SUPERSEDED;
          await decisionRepository.save(context.previousDecision);
        }

        room.currentDecisionId = savedDecision.id;
        room.status = RoomStatus.CONFIRMED;
        await roomRepository.save(room);

        return savedDecision;
      }
    );

    return {
      requestId: this.createRequestId(),
      decision: this.toDecisionPayload(saved),
      roomStatus: RoomStatus.CONFIRMED,
    };
  }

  async reopenDecision(
    roomId: string,
    accessToken: string | undefined,
    input: ReopenDecisionDto
  ): Promise<ReopenDecisionResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const reason = this.validateReopenDecisionInput(input);
    const reopened = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const decisionRepository = manager.getRepository(Decision);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        const currentParticipant = await participantRepository.findOneBy({
          id: actor.participant.id,
        });
        if (
          !currentParticipant ||
          currentParticipant.roomId !== room.id ||
          currentParticipant.role !== ParticipantRole.HOST ||
          currentParticipant.id !== room.hostParticipantId
        ) {
          throw new ForbiddenException('HOST_ONLY');
        }

        if (room.status !== RoomStatus.CONFIRMED || !room.currentDecisionId) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const decision = await decisionRepository.findOneBy({
          id: room.currentDecisionId,
          roomId: room.id,
        });
        if (!decision || decision.status !== DecisionStatus.CONFIRMED) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        decision.status = DecisionStatus.REOPENED;
        decision.reopenedAt = new Date();
        decision.reopenReason = reason;
        const savedDecision = await decisionRepository.save(decision);

        room.status = RoomStatus.OPEN;
        // Keep currentDecisionId so GET /decision can expose the REOPENED history.
        await roomRepository.save(room);

        return savedDecision;
      }
    );

    return {
      requestId: this.createRequestId(),
      decision: this.toDecisionPayload(reopened),
      roomStatus: RoomStatus.OPEN,
      nextStep: 'CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE',
    };
  }

  async getDecision(
    roomId: string,
    accessToken: string | undefined
  ): Promise<DecisionResponse> {
    const { room } = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    const decisionRepository = this.dataSource.getRepository(Decision);

    if (!room.currentDecisionId) {
      throw new NotFoundException('DECISION_NOT_FOUND');
    }

    const decision = await decisionRepository.findOneBy({
      id: room.currentDecisionId,
      roomId: room.id,
    });
    if (!decision) {
      throw new NotFoundException('DECISION_NOT_FOUND');
    }

    const candidate = await this.dataSource
      .getRepository(Candidate)
      .findOneBy({ id: decision.candidateId, roomId: room.id });
    const scoreResult = await this.dataSource
      .getRepository(ScoreResult)
      .findOneBy({ id: decision.scoreResultId, roomId: room.id });
    const scoreCandidate = scoreResult?.candidates.find(
      (item) => item.candidateId === decision.candidateId
    );

    if (!candidate || !scoreResult || !scoreCandidate) {
      throw new NotFoundException('DECISION_NOT_FOUND');
    }

    return {
      requestId: this.createRequestId(),
      decision: {
        ...this.toDecisionPayload(decision),
        candidate: toCandidatePayload(candidate),
        overallScore: scoreCandidate.overallScore,
      },
    };
  }

  private async assertDecisionCanBeConfirmed(
    manager: EntityManager,
    room: Room,
    input: NormalizedCreateDecisionInput
  ): Promise<DecisionConfirmationContext> {
    if (room.status !== RoomStatus.CALCULATED) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    const participantRepository = manager.getRepository(Participant);
    const candidateRepository = manager.getRepository(Candidate);
    const responseRepository = manager.getRepository(ParticipantResponse);
    const scoreResultRepository = manager.getRepository(ScoreResult);
    const decisionRepository = manager.getRepository(Decision);

    const currentConfirmedDecision = await decisionRepository.findOneBy({
      roomId: room.id,
      status: DecisionStatus.CONFIRMED,
    });
    if (currentConfirmedDecision) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    let previousDecision: Decision | null = null;
    if (room.currentDecisionId) {
      const currentDecision = await decisionRepository.findOneBy({
        id: room.currentDecisionId,
        roomId: room.id,
      });
      if (currentDecision?.status === DecisionStatus.REOPENED) {
        previousDecision = currentDecision;
      } else if (currentDecision) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }
    }

    const scoreResult = await scoreResultRepository.findOneBy({
      id: input.scoreResultId,
    });
    if (!scoreResult) {
      throw new NotFoundException('SCORE_RESULT_NOT_FOUND');
    }
    if (scoreResult.roomId !== room.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }
    if (
      room.latestScoreResultId !== input.scoreResultId ||
      scoreResult.status !== ScoreResultStatus.COMPLETED
    ) {
      throw new ConflictException('STALE_RESULT');
    }

    const participants = await participantRepository.find({
      where: { roomId: room.id },
    });
    const activeParticipants = participants.filter(
      (participant) =>
        participant.status !== ParticipantStatus.LEFT &&
        participant.status !== ParticipantStatus.REMOVED
    );
    const activeCandidates = await candidateRepository.find({
      where: { roomId: room.id, status: CandidateStatus.ACTIVE },
    });

    if (
      scoreResult.participantCount !== activeParticipants.length ||
      scoreResult.candidateCount !== activeCandidates.length
    ) {
      throw new ConflictException('STALE_RESULT');
    }

    const requestedCandidate = await candidateRepository.findOneBy({
      id: input.candidateId,
    });
    if (!requestedCandidate || requestedCandidate.roomId !== room.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }
    if (
      requestedCandidate.status !== CandidateStatus.ACTIVE ||
      !activeCandidates.some((candidate) => candidate.id === input.candidateId)
    ) {
      throw new UnprocessableEntityException('BUSINESS_RULE_VIOLATION');
    }

    const scoreCandidate = scoreResult.candidates.find(
      (candidate) => candidate.candidateId === input.candidateId
    );
    if (!scoreCandidate) {
      throw new ConflictException('STALE_RESULT');
    }

    const expectedResponses =
      activeParticipants.length * activeCandidates.length;
    if (
      scoreResult.coverage.totalParticipants !== activeParticipants.length ||
      scoreResult.coverage.expectedResponses !== expectedResponses ||
      scoreResult.coverage.respondedParticipants !==
        activeParticipants.length ||
      scoreResult.coverage.submittedResponses !== expectedResponses
    ) {
      throw new UnprocessableEntityException('BUSINESS_RULE_VIOLATION');
    }

    const activeParticipantIds = new Set(
      activeParticipants.map((participant) => participant.id)
    );
    const activeCandidateIds = new Set(
      activeCandidates.map((candidate) => candidate.id)
    );
    const submittedResponseKeys = new Set<string>();
    const responses = await responseRepository.find({
      where: { roomId: room.id },
    });
    for (const response of responses) {
      if (
        response.roomId === room.id &&
        response.status === ParticipantResponseStatus.SUBMITTED &&
        activeParticipantIds.has(response.participantId) &&
        activeCandidateIds.has(response.candidateId)
      ) {
        submittedResponseKeys.add(
          `${response.participantId}:${response.candidateId}`
        );
      }
    }
    if (submittedResponseKeys.size !== expectedResponses) {
      throw new UnprocessableEntityException('BUSINESS_RULE_VIOLATION');
    }

    const hasIssues =
      scoreCandidate.matchLevel !== 'FULL' ||
      (scoreResult.recommendationWarnings ?? []).includes('LOW_SCORE');
    if (
      hasIssues &&
      (!input.acknowledgeIssues ||
        !input.decisionNote ||
        input.decisionNote.length < 1 ||
        input.decisionNote.length > 300)
    ) {
      throw new UnprocessableEntityException('BUSINESS_RULE_VIOLATION');
    }

    return {
      candidate: requestedCandidate,
      scoreResult,
      previousDecision,
    };
  }

  private validateCreateDecisionInput(
    input: CreateDecisionDto
  ): NormalizedCreateDecisionInput {
    const candidateId =
      typeof input?.candidateId === 'string' ? input.candidateId.trim() : '';
    const scoreResultId =
      typeof input?.scoreResultId === 'string'
        ? input.scoreResultId.trim()
        : '';

    if (
      !candidateId ||
      !scoreResultId ||
      typeof input?.acknowledgeIssues !== 'boolean'
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      input.decisionNote !== undefined &&
      input.decisionNote !== null &&
      typeof input.decisionNote !== 'string'
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    const decisionNote =
      typeof input.decisionNote === 'string' ? input.decisionNote.trim() : null;
    if (decisionNote && decisionNote.length > 300) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return {
      candidateId,
      scoreResultId,
      acknowledgeIssues: input.acknowledgeIssues,
      decisionNote,
    };
  }

  private validateReopenDecisionInput(input: ReopenDecisionDto): string {
    const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 300) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return reason;
  }

  private createRequestId(): string {
    return `req_${randomUUID()}`;
  }

  private toDecisionPayload(decision: Decision): DecisionPayload {
    return {
      id: decision.id,
      roomId: decision.roomId,
      candidateId: decision.candidateId,
      scoreResultId: decision.scoreResultId,
      decidedByParticipantId: decision.decidedByParticipantId,
      status: decision.status,
      acknowledgeIssues: decision.acknowledgeIssues,
      decisionNote: decision.decisionNote,
      confirmedAt: decision.confirmedAt,
      replacedDecisionId: decision.replacedDecisionId,
      reopenedAt: decision.reopenedAt,
      reopenReason: decision.reopenReason,
    };
  }
}

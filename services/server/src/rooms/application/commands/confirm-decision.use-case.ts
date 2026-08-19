import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CandidateStatus,
  type CandidateRecord,
} from '../../domain/candidate/candidate';
import {
  DecisionStatus,
  type DecisionRecord,
} from '../../domain/decision/decision';
import {
  isActiveParticipant,
  ParticipantRole,
} from '../../domain/participant/participant';
import { ParticipantResponseStatus } from '../../domain/participant-response/participant-response';
import { RoomStatus, type RoomRecord } from '../../domain/room/room-status';
import {
  ScoreResultStatus,
  type ScoreResultRecord,
} from '../../domain/calculation/score-result';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsRepositories,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import {
  validateCreateDecisionInput,
  type NormalizedCreateDecisionInput,
} from './decision-input-validation';

type DecisionConfirmationContext = {
  candidate: CandidateRecord;
  scoreResult: ScoreResultRecord;
  previousDecision: DecisionRecord | null;
};

@Injectable()
export class ConfirmDecisionUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
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

    const normalizedInput = validateCreateDecisionInput(input);
    const saved = await this.persistence.transaction(async (repositories) => {
      const { rooms, participants, decisions } = repositories;
      const room = await rooms.findById(roomId, { lock: true });
      if (!room) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }

      const currentParticipant = await participants.findById(
        actor.participant.id
      );
      if (
        !currentParticipant ||
        currentParticipant.roomId !== room.id ||
        currentParticipant.role !== ParticipantRole.HOST ||
        currentParticipant.id !== room.hostParticipantId
      ) {
        throw new ForbiddenException('HOST_ONLY');
      }

      const context = await this.assertDecisionCanBeConfirmed(
        room,
        normalizedInput,
        repositories
      );
      const now = new Date();
      const decision: DecisionRecord = {
        id: randomUUID(),
        roomId: room.id,
        candidateId: context.candidate.id,
        scoreResultId: context.scoreResult.id,
        decidedByParticipantId: currentParticipant.id,
        status: DecisionStatus.CONFIRMED,
        acknowledgeIssues: normalizedInput.acknowledgeIssues,
        decisionNote: normalizedInput.decisionNote,
        confirmedAt: now,
        replacedDecisionId: context.previousDecision?.id ?? null,
        reopenedAt: null,
        reopenReason: null,
        createdAt: now,
        updatedAt: now,
      };
      const savedDecision = await decisions.save(decision);

      if (context.previousDecision) {
        await decisions.save({
          ...context.previousDecision,
          status: DecisionStatus.SUPERSEDED,
          updatedAt: now,
        });
      }

      await rooms.save({
        ...room,
        currentDecisionId: savedDecision.id,
        status: RoomStatus.CONFIRMED,
        updatedAt: now,
      });

      return savedDecision;
    });

    return {
      requestId: `req_${randomUUID()}`,
      decision: saved,
      roomStatus: RoomStatus.CONFIRMED,
    };
  }

  private async assertDecisionCanBeConfirmed(
    room: RoomRecord,
    input: NormalizedCreateDecisionInput,
    repositories: RoomsRepositories
  ): Promise<DecisionConfirmationContext> {
    if (room.status !== RoomStatus.CALCULATED) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    const { participants, candidates, responses, scoreResults, decisions } =
      repositories;
    if (await decisions.findConfirmedByRoomId(room.id)) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    let previousDecision: DecisionRecord | null = null;
    if (room.currentDecisionId) {
      const currentDecision = await decisions.findById(
        room.currentDecisionId,
        room.id
      );
      if (currentDecision?.status === DecisionStatus.REOPENED) {
        previousDecision = currentDecision;
      } else if (currentDecision) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }
    }

    const scoreResult = await scoreResults.findById(input.scoreResultId);
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

    const activeParticipants = (
      await participants.findByRoomId(room.id)
    ).filter(isActiveParticipant);
    const activeCandidates = await candidates.findByRoomId(room.id, {
      activeOnly: true,
    });
    if (
      scoreResult.participantCount !== activeParticipants.length ||
      scoreResult.candidateCount !== activeCandidates.length
    ) {
      throw new ConflictException('STALE_RESULT');
    }

    const requestedCandidate = await candidates.findById(input.candidateId);
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
    for (const response of await responses.findByRoomId(room.id)) {
      if (
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

    return { candidate: requestedCandidate, scoreResult, previousDecision };
  }
}

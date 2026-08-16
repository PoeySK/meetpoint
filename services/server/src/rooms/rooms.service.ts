import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  Participant,
  ParticipantRole,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { JoinParticipantDto } from './dto/join-participant.dto';
import { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import { StartCalculationDto } from './dto/start-calculation.dto';
import {
  Candidate,
  CandidatePlace,
  CandidateStatus,
  CandidateTime,
} from './entities/candidate.entity';
import {
  AvailabilityStatus,
  ParticipantResponse,
  ParticipantResponseStatus,
  TravelBurden,
} from './entities/participant-response.entity';
import { Room, RoomStatus } from './entities/room.entity';
import {
  ScoreResult,
  ScoreResultCandidate,
  ScoreResultCoverage,
  ScoreResultError,
  ScoreResultMetadata,
  ScoreResultStatus,
} from './entities/score-result.entity';
import { CreateRoomDto } from './dto/create-room.dto';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_CANDIDATES = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CALCULATION_POLICY_VERSION = 'mvp-1';
const CALCULATION_SCORING_PROFILE = 'MVP_NO_CONDITIONS';
const CALCULATION_WEIGHTS = {
  time: 40,
  travelBurden: 25,
  budget: 20,
  preference: 15,
};
const VALID_RECOMMENDATION_STATUSES = new Set([
  'INCOMPLETE',
  'FULL_MATCH',
  'PARTIAL_MATCH',
  'NO_FULL_MATCH',
]);
const VALID_MATCH_LEVELS = new Set([
  'FULL',
  'PARTIAL',
  'CONFLICTED',
  'INCOMPLETE',
]);
const VALID_CONFLICT_CODES = new Set([
  'TIME_UNAVAILABLE',
  'TRAVEL_BURDEN_HARD',
]);
const VALID_BLOCKING_ISSUES = new Set(['MISSING_RESPONSE']);
const VALID_EXPLANATION_FLAGS = new Set([
  'MAYBE_RESPONSE',
  'TRAVEL_BURDEN_UNCERTAIN',
  'SELF_REPORTED_TRAVEL_BURDEN',
  'MISSING_RESPONSE',
  'NO_FULL_MATCH',
]);

type NormalizedCreateRoomInput = {
  title: string;
  timezone: string;
  displayName: string;
};

type NormalizedCandidateInput = {
  displayOrder: number;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
};

export interface PublicParticipant {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
}

export interface RoomPayload {
  id: string;
  roomCode: string;
  title: string;
  timezone: string;
  status: RoomStatus;
  hostParticipantId: string;
  maxParticipants: number;
  latestScoreResultId: string | null;
  currentDecisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedRoomResponse {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  access: {
    hostToken: string;
    inviteUrl: string;
  };
}

export interface RoomDetailsResponse {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: CandidatePayload[];
  myResponses: ParticipantResponsePayload[];
  latestScoreResult: null;
  decision: null;
}

export interface CandidatePayload {
  id: string;
  roomId: string;
  displayOrder: number;
  status: CandidateStatus;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
  version: number;
  archivedAt: Date | null;
}

export interface CreatedCandidateResponse {
  requestId: string;
  candidate: CandidatePayload;
}

export interface ParticipantResponsePayload {
  id: string;
  participantId: string;
  candidateId: string;
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
  status: ParticipantResponseStatus;
  submittedAt: Date;
  updatedAt: Date;
}

export interface UpsertedParticipantResponse {
  requestId: string;
  response: ParticipantResponsePayload;
  participantStatus: ParticipantStatus;
  scoreResultStatus: 'STALE';
}

export interface CalculationSummary {
  id: string;
  roomId: string;
  status: ScoreResultStatus;
  policyVersion: string;
  scoringProfile: string;
  createdAt: Date;
}

export interface CalculationPayload extends CalculationSummary {
  inputSnapshotHash: string;
  participantCount: number;
  candidateCount: number;
  metadata: ScoreResultMetadata;
  coverage: ScoreResultCoverage;
  recommendationStatus: string | null;
  recommendationWarnings: string[];
  ranking: string[];
  candidates: ScoreResultCandidate[];
  completedAt: Date | null;
  error?: ScoreResultError;
}

export interface StartCalculationResponse {
  requestId: string;
  calculation: CalculationSummary;
  pollUrl: string;
}

export interface CalculationResponse {
  requestId: string;
  calculation: CalculationPayload;
}

export interface LatestScoreResultResponse {
  requestId: string;
  scoreResult: CalculationPayload;
}

interface SolverSnapshot {
  requestId: string;
  policyVersion: string;
  scoringProfile: string;
  roomId: string;
  participants: Array<{
    participantId: string;
    responses: Array<{
      candidateId: string;
      availabilityStatus: AvailabilityStatus;
      travelBurden: TravelBurden;
      note: string | null;
    }>;
  }>;
  candidates: Array<{
    candidateId: string;
    displayOrder: number;
    time: CandidateTime;
    place: CandidatePlace;
    estimatedCostPerPersonKrw: number;
    tags: string[];
  }>;
}

interface SolverResponsePayload {
  requestId: string;
  policyVersion: string;
  scoringProfile: string;
  status: 'COMPLETED';
  metadata: ScoreResultMetadata;
  recommendationStatus: string;
  recommendationWarnings: string[];
  coverage: ScoreResultCoverage;
  ranking: string[];
  candidates: ScoreResultCandidate[];
}

class SolverCallError extends Error {
  constructor(
    public readonly code: 'SOLVER_ERROR' | 'SOLVER_UNAVAILABLE',
    message: string,
    public readonly retryable: boolean,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'SolverCallError';
  }
}

export interface JoinedParticipantResponse {
  requestId: string;
  room: {
    id: string;
    roomCode: string;
    status: RoomStatus;
  };
  participant: PublicParticipant;
  access: {
    participantToken: string;
  };
}

@Injectable()
export class RoomsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createRoom(input: CreateRoomDto): Promise<CreatedRoomResponse> {
    const normalizedInput = this.validateCreateRoomInput(input);
    const roomId = randomUUID();
    const hostParticipantId = randomUUID();
    const hostToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(hostToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

    let created:
      { room: Room; participant: Participant; roomCode: string } | undefined;

    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = this.generateRoomCode();

      try {
        created = await this.dataSource.transaction(
          async (manager: EntityManager) => {
            const roomRepository = manager.getRepository(Room);
            const participantRepository = manager.getRepository(Participant);
            const room = roomRepository.create({
              id: roomId,
              roomCode,
              title: normalizedInput.title,
              timezone: normalizedInput.timezone,
              status: RoomStatus.DRAFT,
              hostParticipantId,
              maxParticipants: 6,
              latestScoreResultId: null,
              currentDecisionId: null,
            });

            const savedRoom = await roomRepository.save(room);

            const participant = participantRepository.create({
              id: hostParticipantId,
              roomId,
              displayName: normalizedInput.displayName,
              role: ParticipantRole.HOST,
              status: ParticipantStatus.JOINED,
              tokenHash,
              tokenExpiresAt,
              tokenRevokedAt: null,
            });

            this.assertHostParticipant(savedRoom, participant);
            const savedParticipant =
              await participantRepository.save(participant);
            this.assertHostParticipant(savedRoom, savedParticipant);

            return {
              room: savedRoom,
              participant: savedParticipant,
              roomCode,
            };
          }
        );
        break;
      } catch (error) {
        if (!this.isRoomCodeConflict(error)) {
          throw error;
        }
      }
    }

    if (!created) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }

    return {
      requestId: this.createRequestId(),
      room: this.toRoomPayload(created.room),
      hostParticipant: this.toPublicParticipant(created.participant),
      access: {
        hostToken,
        inviteUrl: this.createInviteUrl(created.roomCode),
      },
    };
  }

  async joinParticipant(
    roomCode: string,
    input: JoinParticipantDto
  ): Promise<JoinedParticipantResponse> {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const displayName = this.validateJoinParticipantInput(input);
    const participantId = randomUUID();
    const participantToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(participantToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

    const joined = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const room = await roomRepository.findOne({
          where: { roomCode: normalizedRoomCode },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('ROOM_NOT_FOUND_OR_INVALID_CODE');
        }

        if (
          room.status !== RoomStatus.DRAFT &&
          room.status !== RoomStatus.OPEN
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const participants = await participantRepository.find({
          where: { roomId: room.id },
        });
        const activeParticipantCount = participants.filter(
          (participant) =>
            participant.status !== ParticipantStatus.LEFT &&
            participant.status !== ParticipantStatus.REMOVED
        ).length;

        if (activeParticipantCount >= room.maxParticipants) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        if (room.status === RoomStatus.DRAFT) {
          room.status = RoomStatus.OPEN;
        }

        const participant = participantRepository.create({
          id: participantId,
          roomId: room.id,
          displayName,
          role: ParticipantRole.MEMBER,
          status: ParticipantStatus.JOINED,
          tokenHash,
          tokenExpiresAt,
          tokenRevokedAt: null,
        });

        const savedRoom = await roomRepository.save(room);
        const savedParticipant = await participantRepository.save(participant);

        return { room: savedRoom, participant: savedParticipant };
      }
    );

    return {
      requestId: this.createRequestId(),
      room: {
        id: joined.room.id,
        roomCode: joined.room.roomCode,
        status: joined.room.status,
      },
      participant: this.toPublicParticipant(joined.participant),
      access: {
        participantToken,
      },
    };
  }

  async createCandidate(
    roomId: string,
    accessToken: string | undefined,
    input: CreateCandidateDto
  ): Promise<CreatedCandidateResponse> {
    const actor = await this.getAuthorizedParticipant(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const normalizedInput = this.validateCandidateInput(input);
    const created = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const candidateRepository = manager.getRepository(Candidate);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        this.assertCandidateRoomEditable(room);

        const activeCandidates = await candidateRepository.find({
          where: { roomId: room.id, status: CandidateStatus.ACTIVE },
        });
        if (activeCandidates.length >= MAX_ACTIVE_CANDIDATES) {
          throw new UnprocessableEntityException('CANDIDATE_LIMIT_EXCEEDED');
        }

        if (
          activeCandidates.some((candidate) =>
            this.isDuplicateCandidate(candidate, normalizedInput)
          )
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        if (
          room.status === RoomStatus.DRAFT ||
          room.status === RoomStatus.CALCULATED
        ) {
          if (room.status === RoomStatus.CALCULATED) {
            await this.markLatestScoreResultStale(manager, room);
          }
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const candidate = candidateRepository.create({
          id: randomUUID(),
          roomId: room.id,
          displayOrder: normalizedInput.displayOrder,
          time: normalizedInput.time,
          place: normalizedInput.place,
          estimatedCostPerPersonKrw: normalizedInput.estimatedCostPerPersonKrw,
          tags: normalizedInput.tags,
          status: CandidateStatus.ACTIVE,
          version: 1,
          archivedAt: null,
          createdByParticipantId: actor.participant.id,
        });
        const savedCandidate = await candidateRepository.save(candidate);

        return savedCandidate;
      }
    );

    return {
      requestId: this.createRequestId(),
      candidate: this.toCandidatePayload(created),
    };
  }

  async upsertParticipantResponse(
    roomId: string,
    participantId: string,
    candidateId: string,
    accessToken: string | undefined,
    input: UpsertParticipantResponseDto
  ): Promise<UpsertedParticipantResponse> {
    const actor = await this.getAuthorizedParticipant(roomId, accessToken);
    if (actor.participant.id !== participantId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedInput = this.validateParticipantResponseInput(input);
    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const roomRepository = manager.getRepository(Room);
        const participantRepository = manager.getRepository(Participant);
        const candidateRepository = manager.getRepository(Candidate);
        const responseRepository = manager.getRepository(ParticipantResponse);
        const room = await roomRepository.findOne({
          where: { id: roomId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!room) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        this.assertCandidateRoomEditable(room);

        const candidate = await candidateRepository.findOne({
          where: { id: candidateId },
        });
        if (!candidate || candidate.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }
        if (candidate.status === CandidateStatus.ARCHIVED) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        const participant = await participantRepository.findOneBy({
          id: participantId,
        });
        if (!participant || participant.roomId !== room.id) {
          throw new NotFoundException('RESOURCE_NOT_FOUND');
        }

        if (room.status === RoomStatus.CALCULATED) {
          await this.markLatestScoreResultStale(manager, room);
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const existing = await responseRepository.findOne({
          where: { participantId, candidateId },
        });
        const response =
          existing ??
          responseRepository.create({
            id: randomUUID(),
            roomId: room.id,
            participantId,
            candidateId,
            status: ParticipantResponseStatus.SUBMITTED,
            submittedAt: new Date(),
          });

        response.availabilityStatus = normalizedInput.availabilityStatus;
        response.travelBurden = normalizedInput.travelBurden;
        response.note = normalizedInput.note;
        response.status = ParticipantResponseStatus.SUBMITTED;

        return {
          response: await responseRepository.save(response),
          participantStatus: participant.status,
        };
      }
    );

    return {
      requestId: this.createRequestId(),
      response: this.toParticipantResponsePayload(saved.response),
      participantStatus: saved.participantStatus,
      scoreResultStatus: 'STALE',
    };
  }

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
    const requestId = this.createRequestId();
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
        if (
          allCandidates.length < 2 ||
          allCandidates.length > MAX_ACTIVE_CANDIDATES
        ) {
          throw new UnprocessableEntityException('NO_ACTIVE_CANDIDATES');
        }

        const responses = await responseRepository.find({
          where: { roomId: room.id },
        });
        const snapshot = this.createSolverSnapshot(
          requestId,
          room,
          activeParticipants,
          allCandidates,
          responses
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
          coverage: this.createInitialCoverage(snapshot),
          recommendationStatus: null,
          recommendationWarnings: [],
          ranking: [],
          candidates: [],
          metadata: this.createScoringMetadata(),
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
      calculation: this.toCalculationSummary(prepared.scoreResult),
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
      requestId: this.createRequestId(),
      calculation: this.toCalculationPayload(scoreResult),
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
      requestId: this.createRequestId(),
      scoreResult: this.toCalculationPayload(scoreResult),
    };
  }

  async getRoom(
    roomId: string,
    accessToken?: string
  ): Promise<RoomDetailsResponse> {
    const { room, participant: currentParticipant } =
      await this.getAuthorizedParticipant(roomId, accessToken);
    const participantRepository = this.dataSource.getRepository(Participant);
    const responseRepository = this.dataSource.getRepository(ParticipantResponse);

    const participants = await participantRepository.find({
      where: { roomId: room.id },
      order: { joinedAt: 'ASC' },
    });
    const candidates = await this.dataSource.getRepository(Candidate).find({
      where: { roomId: room.id, status: CandidateStatus.ACTIVE },
      order: { displayOrder: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    const activeCandidateIds = new Set(
      candidates.map((candidate) => candidate.id)
    );
    const currentParticipantResponses = await responseRepository.find({
      where: {
        roomId: room.id,
        participantId: currentParticipant.id,
      },
    });
    const responseByCandidateId = new Map(
      currentParticipantResponses
        .filter(
          (response) =>
            response.roomId === room.id &&
            response.participantId === currentParticipant.id &&
            activeCandidateIds.has(response.candidateId)
        )
        .map((response) => [response.candidateId, response])
    );
    const myResponses = candidates.flatMap((candidate) => {
      const response = responseByCandidateId.get(candidate.id);
      return response ? [this.toParticipantResponsePayload(response)] : [];
    });
    const hostParticipant = participants.find(
      (participant) => participant.id === room.hostParticipantId
    );

    if (!hostParticipant) {
      throw new InternalServerErrorException(
        '호스트 참여자를 찾을 수 없습니다.'
      );
    }
    this.assertHostParticipant(room, hostParticipant);

    return {
      requestId: this.createRequestId(),
      room: this.toRoomPayload(room),
      hostParticipant: this.toPublicParticipant(hostParticipant),
      participants: participants.map((participant) =>
        this.toPublicParticipant(participant)
      ),
      candidates: candidates.map((candidate) =>
        this.toCandidatePayload(candidate)
      ),
      myResponses,
      latestScoreResult: null,
      decision: null,
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

  private createSolverSnapshot(
    requestId: string,
    room: Room,
    participants: Participant[],
    candidates: Candidate[],
    responses: ParticipantResponse[]
  ): SolverSnapshot {
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));

    return {
      requestId,
      policyVersion: CALCULATION_POLICY_VERSION,
      scoringProfile: CALCULATION_SCORING_PROFILE,
      roomId: room.id,
      participants: participants.map((participant) => ({
        participantId: participant.id,
        responses: responses
          .filter(
            (response) =>
              response.participantId === participant.id &&
              candidateIds.has(response.candidateId)
          )
          .map((response) => ({
            candidateId: response.candidateId,
            availabilityStatus: response.availabilityStatus,
            travelBurden: response.travelBurden,
            note: response.note,
          })),
      })),
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.id,
        displayOrder: candidate.displayOrder,
        time: candidate.time,
        place: candidate.place,
        estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
        tags: [...candidate.tags],
      })),
    };
  }

  private createInitialCoverage(snapshot: SolverSnapshot): ScoreResultCoverage {
    const submittedResponses = snapshot.participants.reduce(
      (count, participant) => count + participant.responses.length,
      0
    );

    return {
      respondedParticipants: snapshot.participants.filter(
        (participant) => participant.responses.length > 0
      ).length,
      totalParticipants: snapshot.participants.length,
      submittedResponses,
      expectedResponses:
        snapshot.participants.length * snapshot.candidates.length,
    };
  }

  private createScoringMetadata(): ScoreResultMetadata {
    return {
      scoringProfile: CALCULATION_SCORING_PROFILE,
      weights: { ...CALCULATION_WEIGHTS },
    };
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
      const solverResponse = await this.callSolver(snapshot);
      this.validateSolverResponse(snapshot, solverResponse);
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

  private async callSolver(
    snapshot: SolverSnapshot
  ): Promise<SolverResponsePayload> {
    const baseUrl = (
      process.env.SOLVER_BASE_URL ?? 'http://localhost:4000'
    ).replace(/\/$/, '');
    const timeoutMs = this.readPositiveIntegerEnv(
      'SOLVER_RESPONSE_TIMEOUT_MS',
      3000
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/v1/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) {
          throw new SolverCallError(
            'SOLVER_UNAVAILABLE',
            'Solver is unavailable or timed out.',
            true,
            { timeoutMs }
          );
        }
        throw new SolverCallError(
          'SOLVER_ERROR',
          'Solver returned a non-JSON response.',
          false,
          { status: response.status }
        );
      }

      if (!response.ok) {
        const payloadRecord = this.toRecord(payload);
        const errorRecord = this.toRecord(payloadRecord?.error);
        throw new SolverCallError(
          'SOLVER_ERROR',
          this.readString(errorRecord?.message) ?? 'Solver calculation failed.',
          this.readBoolean(errorRecord?.retryable) ?? false,
          {
            status: response.status,
            solverCode: this.readString(errorRecord?.code),
            solverDetails: this.toRecord(errorRecord?.details) ?? {},
          }
        );
      }

      if (!this.isSolverResponsePayload(payload)) {
        throw new SolverCallError(
          'SOLVER_ERROR',
          'Solver returned an invalid response.',
          false,
          {}
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof SolverCallError) {
        throw error;
      }
      throw new SolverCallError(
        'SOLVER_UNAVAILABLE',
        'Solver is unavailable or timed out.',
        true,
        { timeoutMs }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private validateSolverResponse(
    snapshot: SolverSnapshot,
    response: SolverResponsePayload
  ): void {
    const invalidResponse = (message: string): never => {
      throw new SolverCallError('SOLVER_ERROR', message, false, {});
    };
    const expectedCandidateIds = snapshot.candidates.map(
      (candidate) => candidate.candidateId
    );
    const expectedParticipantIds = new Set(
      snapshot.participants.map((participant) => participant.participantId)
    );
    const actualCandidateIds = response.candidates.map(
      (candidate) => candidate.candidateId
    );
    const expected = [...expectedCandidateIds].sort();
    const actual = [...actualCandidateIds].sort();

    if (
      response.requestId !== snapshot.requestId ||
      response.policyVersion !== snapshot.policyVersion ||
      response.scoringProfile !== snapshot.scoringProfile ||
      response.metadata.scoringProfile !== CALCULATION_SCORING_PROFILE ||
      response.candidates.length !== expectedCandidateIds.length ||
      JSON.stringify(expected) !== JSON.stringify(actual) ||
      JSON.stringify(response.ranking) !== JSON.stringify(actualCandidateIds)
    ) {
      invalidResponse('Solver response does not match the calculation snapshot.');
    }

    if (
      !this.isValidScoringMetadata(response.metadata) ||
      !VALID_RECOMMENDATION_STATUSES.has(response.recommendationStatus) ||
      response.recommendationWarnings.some(
        (warning) => warning !== 'LOW_SCORE'
      )
    ) {
      invalidResponse('Solver response contains invalid scoring metadata.');
    }

    const expectedResponses =
      snapshot.participants.length * snapshot.candidates.length;
    if (
      response.coverage.totalParticipants !== snapshot.participants.length ||
      response.coverage.expectedResponses !== expectedResponses ||
      !this.isValidCoverageCount(
        response.coverage.respondedParticipants,
        response.coverage.totalParticipants
      ) ||
      !this.isValidCoverageCount(
        response.coverage.submittedResponses,
        response.coverage.expectedResponses
      )
    ) {
      invalidResponse('Solver response contains invalid coverage.');
    }

    const submittedResponses = response.candidates.reduce(
      (total, candidate) => total + candidate.coverage.submittedResponses,
      0
    );
    if (submittedResponses !== response.coverage.submittedResponses) {
      invalidResponse('Solver response coverage does not match candidate results.');
    }

    for (const [index, candidate] of response.candidates.entries()) {
      if (
        candidate.rank !== index + 1 ||
        !Number.isFinite(candidate.overallScore) ||
        candidate.overallScore < 0 ||
        candidate.overallScore > 100 ||
        !VALID_MATCH_LEVELS.has(candidate.matchLevel) ||
        !Number.isInteger(candidate.hardConflictCount) ||
        candidate.hardConflictCount < 0 ||
        candidate.coverage.expectedResponses !== snapshot.participants.length ||
        !this.isValidCoverageCount(
          candidate.coverage.submittedResponses,
          candidate.coverage.expectedResponses
        )
      ) {
        invalidResponse('Solver response contains invalid candidate results.');
      }

      const participantIds = candidate.participantBreakdown.map(
        (participant) => participant.participantId
      );
      if (
        participantIds.length !== expectedParticipantIds.size ||
        new Set(participantIds).size !== expectedParticipantIds.size ||
        participantIds.some((participantId) => !expectedParticipantIds.has(participantId))
      ) {
        invalidResponse(
          'Solver response participant breakdown does not match the calculation snapshot.'
        );
      }

      if (
        candidate.conflicts.some(
          (conflict) =>
            !expectedParticipantIds.has(conflict.participantId) ||
            !VALID_CONFLICT_CODES.has(conflict.code)
        ) ||
        candidate.blockingIssues.some(
          (issue) => !VALID_BLOCKING_ISSUES.has(issue)
        ) ||
        candidate.explanationFlags.some(
          (flag) => !VALID_EXPLANATION_FLAGS.has(flag)
        ) ||
        candidate.hardConflictCount !== candidate.conflicts.length
      ) {
        invalidResponse('Solver response contains invalid candidate explanations.');
      }

      for (const participant of candidate.participantBreakdown) {
        const components = participant.components;
        if (
          !Number.isFinite(participant.score) ||
          participant.score < 0 ||
          participant.score > 100 ||
          !Number.isFinite(components.time) ||
          components.time < 0 ||
          components.time > CALCULATION_WEIGHTS.time ||
          !Number.isFinite(components.travelBurden) ||
          components.travelBurden < 0 ||
          components.travelBurden > CALCULATION_WEIGHTS.travelBurden ||
          !Number.isFinite(components.budget) ||
          components.budget < 0 ||
          components.budget > CALCULATION_WEIGHTS.budget ||
          !Number.isFinite(components.preference) ||
          components.preference < 0 ||
          components.preference > CALCULATION_WEIGHTS.preference ||
          participant.hardConflicts.some(
            (conflict) => !VALID_CONFLICT_CODES.has(conflict)
          ) ||
          participant.blockingIssues.some(
            (issue) => !VALID_BLOCKING_ISSUES.has(issue)
          )
        ) {
          invalidResponse('Solver response contains invalid participant scores.');
        }
      }
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

  private toCalculationSummary(scoreResult: ScoreResult): CalculationSummary {
    return {
      id: scoreResult.id,
      roomId: scoreResult.roomId,
      status: scoreResult.status,
      policyVersion: scoreResult.policyVersion,
      scoringProfile: scoreResult.scoringProfile,
      createdAt: scoreResult.createdAt,
    };
  }

  private toCalculationPayload(scoreResult: ScoreResult): CalculationPayload {
    const payload: CalculationPayload = {
      ...this.toCalculationSummary(scoreResult),
      inputSnapshotHash: scoreResult.inputSnapshotHash,
      participantCount: scoreResult.participantCount,
      candidateCount: scoreResult.candidateCount,
      metadata: scoreResult.metadata,
      coverage: scoreResult.coverage,
      recommendationStatus: scoreResult.recommendationStatus,
      recommendationWarnings: scoreResult.recommendationWarnings,
      ranking: scoreResult.ranking,
      candidates: scoreResult.candidates,
      completedAt: scoreResult.completedAt,
    };

    if (scoreResult.error) {
      payload.error = scoreResult.error;
    }

    return payload;
  }

  private isSolverResponsePayload(
    value: unknown
  ): value is SolverResponsePayload {
    const record = this.toRecord(value);
    const candidates = Array.isArray(record?.candidates)
      ? record.candidates
      : undefined;

    return Boolean(
      record &&
      typeof record.requestId === 'string' &&
      typeof record.policyVersion === 'string' &&
      typeof record.scoringProfile === 'string' &&
      record.status === 'COMPLETED' &&
      this.isValidScoringMetadata(record.metadata) &&
      typeof record.recommendationStatus === 'string' &&
      this.isStringArray(record.recommendationWarnings) &&
      this.isValidCoverage(record.coverage) &&
      Array.isArray(record.ranking) &&
      record.ranking.every((candidateId) => typeof candidateId === 'string') &&
      candidates !== undefined &&
      candidates.every((candidate) => this.isValidCandidateResult(candidate))
    );
  }

  private isValidCandidateResult(value: unknown): value is ScoreResultCandidate {
    const record = this.toRecord(value);
    const participantBreakdown = Array.isArray(record?.participantBreakdown)
      ? record.participantBreakdown
      : undefined;
    const conflicts = Array.isArray(record?.conflicts)
      ? record.conflicts
      : undefined;

    return Boolean(
      record &&
      typeof record.candidateId === 'string' &&
      typeof record.rank === 'number' &&
      typeof record.overallScore === 'number' &&
      typeof record.eligible === 'boolean' &&
      typeof record.matchLevel === 'string' &&
      typeof record.hardConflictCount === 'number' &&
      this.isValidCandidateCoverage(record.coverage) &&
      participantBreakdown !== undefined &&
      participantBreakdown.every((participant) =>
        this.isValidParticipantBreakdown(participant)
      ) &&
      this.isStringArray(record.reasons) &&
      conflicts !== undefined &&
      conflicts.every((conflict) => {
        const conflictRecord = this.toRecord(conflict);
        return Boolean(
          conflictRecord &&
          typeof conflictRecord.participantId === 'string' &&
          typeof conflictRecord.code === 'string'
        );
      }) &&
      this.isStringArray(record.blockingIssues) &&
      this.isStringArray(record.explanationFlags)
    );
  }

  private isValidParticipantBreakdown(value: unknown): boolean {
    const record = this.toRecord(value);
    const components = this.toRecord(record?.components);

    return Boolean(
      record &&
      typeof record.participantId === 'string' &&
      typeof record.score === 'number' &&
      components &&
      typeof components.time === 'number' &&
      typeof components.travelBurden === 'number' &&
      typeof components.budget === 'number' &&
      typeof components.preference === 'number' &&
      this.isStringArray(record.hardConflicts) &&
      this.isStringArray(record.blockingIssues) &&
      this.isStringArray(record.reasons)
    );
  }

  private isValidScoringMetadata(value: unknown): value is ScoreResultMetadata {
    const record = this.toRecord(value);
    const weights = this.toRecord(record?.weights);

    return Boolean(
      record &&
      record.scoringProfile === CALCULATION_SCORING_PROFILE &&
      weights &&
      weights.time === CALCULATION_WEIGHTS.time &&
      weights.travelBurden === CALCULATION_WEIGHTS.travelBurden &&
      weights.budget === CALCULATION_WEIGHTS.budget &&
      weights.preference === CALCULATION_WEIGHTS.preference
    );
  }

  private isValidCoverage(value: unknown): value is ScoreResultCoverage {
    const record = this.toRecord(value);

    return Boolean(
      record &&
      typeof record.respondedParticipants === 'number' &&
      typeof record.totalParticipants === 'number' &&
      typeof record.submittedResponses === 'number' &&
      typeof record.expectedResponses === 'number'
    );
  }

  private isValidCandidateCoverage(value: unknown): boolean {
    const record = this.toRecord(value);

    return Boolean(
      record &&
      typeof record.submittedResponses === 'number' &&
      typeof record.expectedResponses === 'number'
    );
  }

  private isValidCoverageCount(value: number, maximum: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= maximum;
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }

  private readPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private async getAuthorizedParticipant(
    roomId: string,
    accessToken?: string
  ): Promise<{ room: Room; participant: Participant }> {
    if (!accessToken) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }

    const participantRepository = this.dataSource.getRepository(Participant);
    const roomRepository = this.dataSource.getRepository(Room);
    const participant = await participantRepository.findOneBy({
      tokenHash: this.hashToken(accessToken),
    });

    if (!participant) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    if (
      participant.tokenRevokedAt ||
      participant.tokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('TOKEN_EXPIRED');
    }

    const room = await roomRepository.findOneBy({ id: roomId });
    if (!room || participant.roomId !== room.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    return { room, participant };
  }

  private assertCandidateRoomEditable(room: Room): void {
    if (
      room.status === RoomStatus.CALCULATING ||
      room.status === RoomStatus.CONFIRMED ||
      room.status === RoomStatus.CLOSED
    ) {
      throw new ConflictException('ROOM_STATE_CONFLICT');
    }
  }

  private async markLatestScoreResultStale(
    manager: EntityManager,
    room: Room
  ): Promise<void> {
    if (!room.latestScoreResultId) {
      return;
    }

    const scoreResultRepository = manager.getRepository(ScoreResult);
    const scoreResult = await scoreResultRepository.findOneBy({
      id: room.latestScoreResultId,
      roomId: room.id,
    });
    if (scoreResult && scoreResult.status === ScoreResultStatus.COMPLETED) {
      scoreResult.status = ScoreResultStatus.STALE;
      await scoreResultRepository.save(scoreResult);
    }
  }

  private validateCandidateInput(
    input: CreateCandidateDto
  ): NormalizedCandidateInput {
    const candidate = input as unknown as {
      displayOrder?: unknown;
      time?: {
        startsAt?: unknown;
        endsAt?: unknown;
        timezone?: unknown;
      };
      place?: {
        name?: unknown;
        address?: unknown;
        area?: unknown;
      };
      estimatedCostPerPersonKrw?: unknown;
      tags?: unknown;
    };
    const startsAt = candidate.time?.startsAt;
    const endsAt = candidate.time?.endsAt;
    const timezone = candidate.time?.timezone;
    const placeName = candidate.place?.name;
    const address = candidate.place?.address;
    const area = candidate.place?.area;
    const tags = candidate.tags;

    if (
      typeof candidate.displayOrder !== 'number' ||
      !Number.isInteger(candidate.displayOrder) ||
      candidate.displayOrder < 1
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (
      typeof startsAt !== 'string' ||
      typeof endsAt !== 'string' ||
      typeof timezone !== 'string'
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      typeof placeName !== 'string' ||
      placeName.trim().length < 1 ||
      placeName.trim().length > 120 ||
      typeof address !== 'string' ||
      address.trim().length < 1 ||
      address.trim().length > 120 ||
      typeof area !== 'string' ||
      area.trim().length < 1
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      typeof candidate.estimatedCostPerPersonKrw !== 'number' ||
      !Number.isInteger(candidate.estimatedCostPerPersonKrw) ||
      candidate.estimatedCostPerPersonKrw < 0 ||
      candidate.estimatedCostPerPersonKrw > 2_000_000
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    if (
      !Array.isArray(tags) ||
      tags.length > 10 ||
      tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return {
      displayOrder: candidate.displayOrder,
      time: { startsAt, endsAt, timezone },
      place: {
        name: placeName.trim(),
        address: address.trim(),
        area: area.trim(),
      },
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: tags.map((tag) => (tag as string).trim().toUpperCase()),
    };
  }

  private validateParticipantResponseInput(
    input: UpsertParticipantResponseDto
  ): {
    availabilityStatus: AvailabilityStatus;
    travelBurden: TravelBurden;
    note: string | null;
  } {
    const candidate = input as unknown as {
      availabilityStatus?: unknown;
      travelBurden?: unknown;
      note?: unknown;
    };
    const availabilityStatus = candidate.availabilityStatus;
    const travelBurden = candidate.travelBurden;

    if (
      !Object.values(AvailabilityStatus).includes(
        availabilityStatus as AvailabilityStatus
      ) ||
      !Object.values(TravelBurden).includes(travelBurden as TravelBurden)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (
      candidate.note !== undefined &&
      candidate.note !== null &&
      (typeof candidate.note !== 'string' || candidate.note.trim().length > 300)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return {
      availabilityStatus: availabilityStatus as AvailabilityStatus,
      travelBurden: travelBurden as TravelBurden,
      note: typeof candidate.note === 'string' ? candidate.note.trim() : null,
    };
  }

  private isDuplicateCandidate(
    candidate: Candidate,
    input: NormalizedCandidateInput
  ): boolean {
    return (
      candidate.time.startsAt === input.time.startsAt &&
      candidate.time.endsAt === input.time.endsAt &&
      candidate.time.timezone === input.time.timezone &&
      candidate.place.name === input.place.name &&
      candidate.place.address === input.place.address &&
      candidate.place.area === input.place.area
    );
  }

  private validateCreateRoomInput(
    input: CreateRoomDto
  ): NormalizedCreateRoomInput {
    const candidate = input as unknown as {
      title?: unknown;
      timezone?: unknown;
      host?: { displayName?: unknown };
    };
    const title =
      typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const timezone =
      typeof candidate.timezone === 'string' ? candidate.timezone.trim() : '';
    const displayName =
      typeof candidate.host?.displayName === 'string'
        ? candidate.host.displayName.trim()
        : '';

    if (!title || title.length > 80) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (!displayName || displayName.length > 30) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return { title, timezone, displayName };
  }

  private validateJoinParticipantInput(input: JoinParticipantDto): string {
    const candidate = input as unknown as { displayName?: unknown };
    const displayName =
      typeof candidate.displayName === 'string'
        ? candidate.displayName.trim()
        : '';

    if (!displayName || displayName.length > 30) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return displayName;
  }

  private assertHostParticipant(room: Room, participant: Participant): void {
    if (
      room.hostParticipantId !== participant.id ||
      participant.roomId !== room.id ||
      participant.role !== ParticipantRole.HOST
    ) {
      throw new InternalServerErrorException(
        '호스트 참여자와 방의 소속 정보가 일치하지 않습니다.'
      );
    }
  }

  private generateRoomCode(): string {
    let roomCode = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const randomIndex = randomBytes(1)[0] % ROOM_CODE_ALPHABET.length;
      roomCode += ROOM_CODE_ALPHABET[randomIndex];
    }
    return roomCode;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createInviteUrl(roomCode: string): string {
    const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
    return `${clientOrigin.replace(/\/$/, '')}/join/${roomCode}`;
  }

  private createRequestId(): string {
    return `req_${randomUUID()}`;
  }

  private isRoomCodeConflict(error: unknown): boolean {
    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = candidate.code ?? candidate.driverError?.code;
    const constraint =
      candidate.constraint ?? candidate.driverError?.constraint;

    return (
      code === '23505' &&
      (constraint === undefined ||
        (typeof constraint === 'string' &&
          constraint.toLowerCase().includes('room')))
    );
  }

  private toRoomPayload(room: Room): RoomPayload {
    return {
      id: room.id,
      roomCode: room.roomCode,
      title: room.title,
      timezone: room.timezone,
      status: room.status,
      hostParticipantId: room.hostParticipantId,
      maxParticipants: room.maxParticipants,
      latestScoreResultId: room.latestScoreResultId,
      currentDecisionId: room.currentDecisionId,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private toCandidatePayload(candidate: Candidate): CandidatePayload {
    return {
      id: candidate.id,
      roomId: candidate.roomId,
      displayOrder: candidate.displayOrder,
      status: candidate.status,
      time: candidate.time,
      place: candidate.place,
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: [...candidate.tags],
      version: candidate.version,
      archivedAt: candidate.archivedAt,
    };
  }

  private toParticipantResponsePayload(
    response: ParticipantResponse
  ): ParticipantResponsePayload {
    return {
      id: response.id,
      participantId: response.participantId,
      candidateId: response.candidateId,
      availabilityStatus: response.availabilityStatus,
      travelBurden: response.travelBurden,
      note: response.note,
      status: response.status,
      submittedAt: response.submittedAt,
      updatedAt: response.updatedAt,
    };
  }

  private toPublicParticipant(participant: Participant): PublicParticipant {
    return {
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role,
      status: participant.status,
    };
  }
}

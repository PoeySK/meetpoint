import type { CandidateRecord } from '../../domain/candidate/candidate';
import type { DecisionRecord } from '../../domain/decision/decision';
import type { ParticipantRecord } from '../../domain/participant/participant';
import type { ParticipantResponseRecord } from '../../domain/participant-response/participant-response';
import type { RoomRecord } from '../../domain/room/room-status';
import type { ScoreResultRecord } from '../../domain/calculation/score-result';

export type RepositoryLookupOptions = {
  lock?: boolean;
};

export interface RoomRepositoryPort {
  findById(
    id: string,
    options?: RepositoryLookupOptions
  ): Promise<RoomRecord | null>;
  findByCode(
    roomCode: string,
    options?: RepositoryLookupOptions
  ): Promise<RoomRecord | null>;
  save(room: RoomRecord): Promise<RoomRecord>;
}

export interface ParticipantRepositoryPort {
  findById(id: string): Promise<ParticipantRecord | null>;
  findByTokenHash(tokenHash: string): Promise<ParticipantRecord | null>;
  findByRoomId(roomId: string): Promise<ParticipantRecord[]>;
  save(participant: ParticipantRecord): Promise<ParticipantRecord>;
}

export interface CandidateRepositoryPort {
  findById(id: string): Promise<CandidateRecord | null>;
  findByRoomId(
    roomId: string,
    options?: { activeOnly?: boolean; ordered?: boolean }
  ): Promise<CandidateRecord[]>;
  save(candidate: CandidateRecord): Promise<CandidateRecord>;
}

export interface ParticipantResponseRepositoryPort {
  findByRoomId(roomId: string): Promise<ParticipantResponseRecord[]>;
  findByParticipantAndCandidate(
    roomId: string,
    participantId: string,
    candidateId: string
  ): Promise<ParticipantResponseRecord | null>;
  save(response: ParticipantResponseRecord): Promise<ParticipantResponseRecord>;
}

export interface ScoreResultRepositoryPort {
  findById(
    id: string,
    options?: RepositoryLookupOptions
  ): Promise<ScoreResultRecord | null>;
  findByRoomAndClientRequestId(
    roomId: string,
    clientRequestId: string
  ): Promise<ScoreResultRecord | null>;
  findLatestByRoomId(roomId: string): Promise<ScoreResultRecord | null>;
  save(scoreResult: ScoreResultRecord): Promise<ScoreResultRecord>;
}

export interface DecisionRepositoryPort {
  findById(id: string, roomId: string): Promise<DecisionRecord | null>;
  findConfirmedByRoomId(roomId: string): Promise<DecisionRecord | null>;
  save(decision: DecisionRecord): Promise<DecisionRecord>;
}

export interface RoomsRepositories {
  rooms: RoomRepositoryPort;
  participants: ParticipantRepositoryPort;
  candidates: CandidateRepositoryPort;
  responses: ParticipantResponseRepositoryPort;
  scoreResults: ScoreResultRepositoryPort;
  decisions: DecisionRepositoryPort;
}

export interface RoomsPersistencePort {
  transaction<T>(
    work: (repositories: RoomsRepositories) => Promise<T>
  ): Promise<T>;
}

export const ROOMS_PERSISTENCE = Symbol('ROOMS_PERSISTENCE');

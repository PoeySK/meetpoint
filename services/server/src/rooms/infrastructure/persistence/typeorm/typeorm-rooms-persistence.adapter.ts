import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Candidate } from './entities/candidate.entity';
import { Decision } from './entities/decision.entity';
import { Participant } from './entities/participant.entity';
import { ParticipantResponse } from './entities/participant-response.entity';
import { ParticipantCondition } from './entities/participant-condition.entity';
import { Room } from './entities/room.entity';
import { ScoreResult } from './entities/score-result.entity';
import { CandidateStatus } from '../../../domain/candidate/candidate';
import { DecisionStatus } from '../../../domain/decision/decision';
import type {
  CandidateRepositoryPort,
  DecisionRepositoryPort,
  ParticipantRepositoryPort,
  ParticipantResponseRepositoryPort,
  ParticipantConditionRepositoryPort,
  RoomRepositoryPort,
  RoomsPersistencePort,
  RoomsRepositories,
  ScoreResultRepositoryPort,
} from '../../../application/ports/rooms-persistence.port';
import {
  toCandidateEntity,
  toCandidateRecord,
  toDecisionEntity,
  toDecisionRecord,
  toParticipantEntity,
  toParticipantRecord,
  toParticipantResponseEntity,
  toParticipantResponseRecord,
  toParticipantConditionEntity,
  toParticipantConditionRecord,
  toRoomEntity,
  toRoomRecord,
  toScoreResultEntity,
  toScoreResultRecord,
} from './mappers/record-mappers';

@Injectable()
export class TypeOrmRoomsPersistenceAdapter implements RoomsPersistencePort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  transaction<T>(
    work: (repositories: RoomsRepositories) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work(this.createRepositories(manager))
    );
  }

  private createRepositories(manager: EntityManager): RoomsRepositories {
    return {
      rooms: this.createRoomRepository(manager),
      participants: this.createParticipantRepository(manager),
      candidates: this.createCandidateRepository(manager),
      responses: this.createParticipantResponseRepository(manager),
      conditions: this.createParticipantConditionRepository(manager),
      scoreResults: this.createScoreResultRepository(manager),
      decisions: this.createDecisionRepository(manager),
    };
  }

  private createRoomRepository(manager: EntityManager): RoomRepositoryPort {
    const repository = manager.getRepository(Room);

    return {
      async findById(id, options) {
        const entity = await repository.findOne({
          where: { id },
          ...(options?.lock
            ? { lock: { mode: 'pessimistic_write' as const } }
            : {}),
        });
        return entity ? toRoomRecord(entity) : null;
      },
      async findByCode(roomCode, options) {
        const entity = await repository.findOne({
          where: { roomCode },
          ...(options?.lock
            ? { lock: { mode: 'pessimistic_write' as const } }
            : {}),
        });
        return entity ? toRoomRecord(entity) : null;
      },
      async save(room) {
        return toRoomRecord(await repository.save(toRoomEntity(room)));
      },
    };
  }

  private createParticipantRepository(
    manager: EntityManager
  ): ParticipantRepositoryPort {
    const repository = manager.getRepository(Participant);

    return {
      async findById(id) {
        const entity = await repository.findOneBy({ id });
        return entity ? toParticipantRecord(entity) : null;
      },
      async findByTokenHash(tokenHash) {
        const entity = await repository.findOneBy({ tokenHash });
        return entity ? toParticipantRecord(entity) : null;
      },
      async findByRoomId(roomId) {
        const entities = await repository.find({
          where: { roomId },
          order: { joinedAt: 'ASC' },
        });
        return entities.map(toParticipantRecord);
      },
      async save(participant) {
        return toParticipantRecord(
          await repository.save(toParticipantEntity(participant))
        );
      },
    };
  }

  private createCandidateRepository(
    manager: EntityManager
  ): CandidateRepositoryPort {
    const repository = manager.getRepository(Candidate);

    return {
      async findById(id) {
        const entity = await repository.findOneBy({ id });
        return entity ? toCandidateRecord(entity) : null;
      },
      async findByRoomId(roomId, options) {
        const entities = await repository.find({
          where: {
            roomId,
            ...(options?.activeOnly ? { status: CandidateStatus.ACTIVE } : {}),
          },
          ...(options?.ordered
            ? { order: { displayOrder: 'ASC', createdAt: 'ASC', id: 'ASC' } }
            : {}),
        });
        return entities.map(toCandidateRecord);
      },
      async save(candidate) {
        return toCandidateRecord(
          await repository.save(toCandidateEntity(candidate))
        );
      },
      async saveIfVersion(candidate, expectedVersion) {
        const result = await repository.update(
          {
            id: candidate.id,
            roomId: candidate.roomId,
            version: expectedVersion,
          },
          {
            displayOrder: candidate.displayOrder,
            time: candidate.time,
            place: candidate.place,
            estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
            tags: candidate.tags,
            status: candidate.status,
            version: candidate.version,
            archivedAt: candidate.archivedAt,
            updatedAt: candidate.updatedAt,
          }
        );
        if (!result.affected) {
          return null;
        }

        const saved = await repository.findOneBy({
          id: candidate.id,
          roomId: candidate.roomId,
        });
        return saved ? toCandidateRecord(saved) : null;
      },
    };
  }

  private createParticipantResponseRepository(
    manager: EntityManager
  ): ParticipantResponseRepositoryPort {
    const repository = manager.getRepository(ParticipantResponse);

    return {
      async findByRoomId(roomId) {
        const entities = await repository.find({ where: { roomId } });
        return entities.map(toParticipantResponseRecord);
      },
      async findByParticipantAndCandidate(roomId, participantId, candidateId) {
        const entity = await repository.findOneBy({
          roomId,
          participantId,
          candidateId,
        });
        return entity ? toParticipantResponseRecord(entity) : null;
      },
      async save(response) {
        return toParticipantResponseRecord(
          await repository.save(toParticipantResponseEntity(response))
        );
      },
    };
  }

  private createParticipantConditionRepository(
    manager: EntityManager
  ): ParticipantConditionRepositoryPort {
    const repository = manager.getRepository(ParticipantCondition);

    return {
      async findByParticipantId(roomId, participantId) {
        const entity = await repository.findOneBy({ roomId, participantId });
        return entity ? toParticipantConditionRecord(entity) : null;
      },
      async findByRoomId(roomId) {
        const entities = await repository.find({ where: { roomId } });
        return entities.map(toParticipantConditionRecord);
      },
      async save(condition) {
        return toParticipantConditionRecord(
          await repository.save(toParticipantConditionEntity(condition))
        );
      },
    };
  }

  private createScoreResultRepository(
    manager: EntityManager
  ): ScoreResultRepositoryPort {
    const repository = manager.getRepository(ScoreResult);

    return {
      async findById(id, options) {
        const entity = await repository.findOne({
          where: { id },
          ...(options?.lock
            ? { lock: { mode: 'pessimistic_write' as const } }
            : {}),
        });
        return entity ? toScoreResultRecord(entity) : null;
      },
      async findByRoomAndClientRequestId(roomId, clientRequestId) {
        const entity = await repository.findOneBy({ roomId, clientRequestId });
        return entity ? toScoreResultRecord(entity) : null;
      },
      async findLatestByRoomId(roomId) {
        const entity = await repository.findOne({
          where: { roomId },
          order: { createdAt: 'DESC' },
        });
        return entity ? toScoreResultRecord(entity) : null;
      },
      async save(scoreResult) {
        return toScoreResultRecord(
          await repository.save(toScoreResultEntity(scoreResult))
        );
      },
    };
  }

  private createDecisionRepository(
    manager: EntityManager
  ): DecisionRepositoryPort {
    const repository = manager.getRepository(Decision);

    return {
      async findById(id, roomId) {
        const entity = await repository.findOneBy({ id, roomId });
        return entity ? toDecisionRecord(entity) : null;
      },
      async findConfirmedByRoomId(roomId) {
        const entity = await repository.findOneBy({
          roomId,
          status: DecisionStatus.CONFIRMED,
        });
        return entity ? toDecisionRecord(entity) : null;
      },
      async save(decision) {
        return toDecisionRecord(
          await repository.save(toDecisionEntity(decision))
        );
      },
    };
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ParticipantRole } from '../participants/entities/participant.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { getAuthorizedParticipant } from './room-access';
import { toCandidatePayload } from './room-payload';
import {
  createRequestId,
  type CreatedCandidateResponse,
} from './room-response';
import { assertRoomEditable } from './room-state';
import { markLatestScoreResultStale } from './room-score-state';
import {
  isDuplicateCandidate,
  validateCandidateInput,
} from './room-validation';

const MAX_ACTIVE_CANDIDATES = 5;

@Injectable()
export class CandidateService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createCandidate(
    roomId: string,
    accessToken: string | undefined,
    input: CreateCandidateDto
  ): Promise<CreatedCandidateResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const normalizedInput = validateCandidateInput(input);
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
        assertRoomEditable(room);

        const activeCandidates = await candidateRepository.find({
          where: { roomId: room.id, status: CandidateStatus.ACTIVE },
        });
        if (activeCandidates.length >= MAX_ACTIVE_CANDIDATES) {
          throw new UnprocessableEntityException('CANDIDATE_LIMIT_EXCEEDED');
        }

        if (
          activeCandidates.some((candidate) =>
            isDuplicateCandidate(candidate, normalizedInput)
          )
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        await markLatestScoreResultStale(manager, room);
        if (
          room.status === RoomStatus.DRAFT ||
          room.status === RoomStatus.CALCULATED
        ) {
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
        return candidateRepository.save(candidate);
      }
    );

    return {
      requestId: createRequestId(),
      candidate: toCandidatePayload(created),
    };
  }
}

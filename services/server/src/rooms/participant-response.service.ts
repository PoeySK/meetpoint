import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import {
  ParticipantResponse,
  ParticipantResponseStatus,
} from './entities/participant-response.entity';
import {
  Participant,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { getAuthorizedParticipant } from './room-access';
import {
  createRequestId,
  toParticipantResponsePayload,
  type UpsertedParticipantResponse,
} from './room-response';
import { assertRoomEditable } from './room-state';
import { markLatestScoreResultStale } from './room-score-state';
import { validateParticipantResponseInput } from './room-validation';

@Injectable()
export class ParticipantResponseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async upsertParticipantResponse(
    roomId: string,
    participantId: string,
    candidateId: string,
    accessToken: string | undefined,
    input: UpsertParticipantResponseDto
  ): Promise<UpsertedParticipantResponse> {
    const actor = await getAuthorizedParticipant(
      this.dataSource,
      roomId,
      accessToken
    );
    if (actor.participant.id !== participantId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedInput = validateParticipantResponseInput(input);
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
        assertRoomEditable(room);

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
        if (
          participant.status !== ParticipantStatus.JOINED &&
          participant.status !== ParticipantStatus.RESPONDED
        ) {
          throw new ConflictException('ROOM_STATE_CONFLICT');
        }

        await markLatestScoreResultStale(manager, room);
        if (room.status === RoomStatus.CALCULATED) {
          room.status = RoomStatus.OPEN;
          await roomRepository.save(room);
        }

        const existing = await responseRepository.findOne({
          where: { roomId: room.id, participantId, candidateId },
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
      requestId: createRequestId(),
      response: toParticipantResponsePayload(saved.response),
      participantStatus: saved.participantStatus,
      scoreResultStatus: 'STALE',
    };
  }
}

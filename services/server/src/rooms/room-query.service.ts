import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate, CandidateStatus } from './entities/candidate.entity';
import { ParticipantResponse } from './entities/participant-response.entity';
import { getAuthorizedParticipant } from './room-access';
import { toCandidatePayload } from './room-payload';
import {
  createRequestId,
  toParticipantResponsePayload,
  toPublicParticipant,
  toRoomPayload,
  type RoomDetailsResponse,
} from './room-response';
import { assertHostParticipant } from './room-validation';
import { isActiveParticipant } from './room-state';

@Injectable()
export class RoomQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getRoom(
    roomId: string,
    accessToken?: string
  ): Promise<RoomDetailsResponse> {
    const { room, participant: currentParticipant } =
      await getAuthorizedParticipant(this.dataSource, roomId, accessToken);
    const participantRepository = this.dataSource.getRepository(Participant);
    const responseRepository =
      this.dataSource.getRepository(ParticipantResponse);

    const participants = (
      await participantRepository.find({
        where: { roomId: room.id },
        order: { joinedAt: 'ASC' },
      })
    ).filter(isActiveParticipant);
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
      return response ? [toParticipantResponsePayload(response)] : [];
    });
    const hostParticipant = participants.find(
      (participant) => participant.id === room.hostParticipantId
    );

    if (!hostParticipant) {
      throw new InternalServerErrorException(
        'Room host participant was not found.'
      );
    }
    assertHostParticipant(room, hostParticipant);

    return {
      requestId: createRequestId(),
      room: toRoomPayload(room),
      hostParticipant: toPublicParticipant(hostParticipant),
      currentParticipant: toPublicParticipant(currentParticipant),
      participants: participants.map((participant) =>
        toPublicParticipant(participant)
      ),
      candidates: candidates.map((candidate) => toCandidatePayload(candidate)),
      myResponses,
      latestScoreResult: null,
      decision: null,
    };
  }
}

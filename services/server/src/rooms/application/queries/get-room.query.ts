import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { isActiveParticipant } from '../../domain/participant/participant';
import { assertHostParticipant } from '../commands/input-validation';

@Injectable()
export class GetRoomQuery {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(roomId: string, accessToken?: string) {
    const { room, participant: currentParticipant } =
      await this.access.authorize(roomId, accessToken);

    return this.persistence.transaction(
      async ({ participants, candidates, responses, conditions }) => {
        const activeParticipants = (
          await participants.findByRoomId(room.id)
        ).filter(isActiveParticipant);
        const activeCandidates = await candidates.findByRoomId(room.id, {
          activeOnly: true,
          ordered: true,
        });
        const activeCandidateIds = new Set(
          activeCandidates.map((candidate) => candidate.id)
        );
        const currentParticipantResponses = await responses.findByRoomId(
          room.id
        );
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
        const myResponses = activeCandidates.flatMap((candidate) => {
          const response = responseByCandidateId.get(candidate.id);
          return response ? [response] : [];
        });
        const myCondition = await conditions.findByParticipantId(
          room.id,
          currentParticipant.id
        );
        const hostParticipant = activeParticipants.find(
          (candidate) => candidate.id === room.hostParticipantId
        );

        if (!hostParticipant) {
          throw new InternalServerErrorException(
            'Room host participant was not found.'
          );
        }
        assertHostParticipant(room, hostParticipant);

        return {
          room,
          hostParticipant,
          currentParticipant,
          participants: activeParticipants,
          candidates: activeCandidates,
          myResponses,
          myCondition,
        };
      }
    );
  }
}

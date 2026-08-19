import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';

@Injectable()
export class GetDecisionQuery {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(roomId: string, accessToken: string | undefined) {
    const { room } = await this.access.authorize(roomId, accessToken);
    if (!room.currentDecisionId) {
      throw new NotFoundException('DECISION_NOT_FOUND');
    }

    const projection = await this.persistence.transaction(
      async (repositories) => {
        const decision = await repositories.decisions.findById(
          room.currentDecisionId as string,
          room.id
        );
        if (!decision) {
          throw new NotFoundException('DECISION_NOT_FOUND');
        }

        const candidate = await repositories.candidates.findById(
          decision.candidateId
        );
        const scoreResult = await repositories.scoreResults.findById(
          decision.scoreResultId
        );
        const scoreCandidate = scoreResult?.candidates.find(
          (item) => item.candidateId === decision.candidateId
        );

        if (
          !candidate ||
          candidate.roomId !== room.id ||
          !scoreResult ||
          !scoreCandidate
        ) {
          throw new NotFoundException('DECISION_NOT_FOUND');
        }

        return {
          decision,
          candidate,
          overallScore: scoreCandidate.overallScore,
        };
      }
    );

    return projection;
  }
}

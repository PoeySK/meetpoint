import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';

@Injectable()
export class GetLatestScoreResultQuery {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(roomId: string, accessToken: string | undefined) {
    const { room } = await this.access.authorize(roomId, accessToken);
    const scoreResult = await this.persistence.transaction(
      async ({ scoreResults }) =>
        room.latestScoreResultId
          ? scoreResults.findById(room.latestScoreResultId)
          : scoreResults.findLatestByRoomId(roomId)
    );
    if (!scoreResult) {
      throw new NotFoundException('SCORE_RESULT_NOT_FOUND');
    }
    return scoreResult;
  }
}

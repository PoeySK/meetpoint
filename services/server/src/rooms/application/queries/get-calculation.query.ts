import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';

@Injectable()
export class GetCalculationQuery {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    calculationId: string,
    accessToken: string | undefined
  ) {
    await this.access.authorize(roomId, accessToken);
    const scoreResult = await this.persistence.transaction(({ scoreResults }) =>
      scoreResults.findById(calculationId)
    );
    if (!scoreResult || scoreResult.roomId !== roomId) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }
    return scoreResult;
  }
}

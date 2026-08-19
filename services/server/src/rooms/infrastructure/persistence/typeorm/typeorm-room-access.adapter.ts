import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Participant } from './entities/participant.entity';
import { Room } from './entities/room.entity';
import { ParticipantStatus } from '../../../domain/participant/participant';
import type {
  AuthorizedParticipant,
  RoomAccessPort,
} from '../../../application/ports/room-access.port';
import { AccessTokenAdapter } from '../../security/access-token.adapter';
import { toParticipantRecord, toRoomRecord } from './mappers/record-mappers';

@Injectable()
export class TypeOrmRoomAccessAdapter implements RoomAccessPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accessTokenAdapter: AccessTokenAdapter
  ) {}

  async authorize(
    roomId: string,
    accessToken?: string
  ): Promise<AuthorizedParticipant> {
    if (!accessToken) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }

    const participantEntity = await this.dataSource
      .getRepository(Participant)
      .findOneBy({ tokenHash: this.accessTokenAdapter.hash(accessToken) });

    if (!participantEntity) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }

    const participant = toParticipantRecord(participantEntity);
    if (
      participant.tokenRevokedAt ||
      participant.tokenExpiresAt.getTime() <= Date.now() ||
      participant.status === ParticipantStatus.LEFT ||
      participant.status === ParticipantStatus.REMOVED
    ) {
      throw new UnauthorizedException('TOKEN_EXPIRED');
    }

    const roomEntity = await this.dataSource
      .getRepository(Room)
      .findOneBy({ id: roomId });
    if (!roomEntity || participant.roomId !== roomEntity.id) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    return {
      room: toRoomRecord(roomEntity),
      participant,
    };
  }
}

import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  Participant,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Room } from './entities/room.entity';

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function extractBearerToken(authorization?: string): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }
  return token;
}

export async function getAuthorizedParticipant(
  dataSource: DataSource,
  roomId: string,
  accessToken?: string
): Promise<{ room: Room; participant: Participant }> {
  if (!accessToken) {
    throw new UnauthorizedException('MISSING_TOKEN');
  }

  const participantRepository = dataSource.getRepository(Participant);
  const roomRepository = dataSource.getRepository(Room);
  const participant = await participantRepository.findOneBy({
    tokenHash: hashAccessToken(accessToken),
  });

  if (!participant) {
    throw new UnauthorizedException('INVALID_TOKEN');
  }
  if (
    participant.tokenRevokedAt ||
    participant.tokenExpiresAt.getTime() <= Date.now() ||
    participant.status === ParticipantStatus.LEFT ||
    participant.status === ParticipantStatus.REMOVED
  ) {
    throw new UnauthorizedException('TOKEN_EXPIRED');
  }

  const room = await roomRepository.findOneBy({ id: roomId });
  if (!room || participant.roomId !== room.id) {
    throw new NotFoundException('RESOURCE_NOT_FOUND');
  }

  return { room, participant };
}

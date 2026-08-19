import type { ParticipantRecord } from '../../domain/participant/participant';
import type { RoomRecord } from '../../domain/room/room-status';

export interface AuthorizedParticipant {
  room: RoomRecord;
  participant: ParticipantRecord;
}

export interface RoomAccessPort {
  authorize(
    roomId: string,
    accessToken?: string
  ): Promise<AuthorizedParticipant>;
}

export interface AccessTokenPort {
  issue(): {
    token: string;
    tokenHash: string;
    tokenExpiresAt: Date;
  };
  hash(token: string): string;
}

export const ROOM_ACCESS = Symbol('ROOM_ACCESS');
export const ACCESS_TOKEN = Symbol('ACCESS_TOKEN');

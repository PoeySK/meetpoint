import { ConflictException } from '@nestjs/common';
import {
  Participant,
  ParticipantStatus,
} from '../participants/entities/participant.entity';
import { Room, RoomStatus } from './entities/room.entity';

export function assertRoomEditable(room: Room): void {
  if (
    room.status === RoomStatus.CALCULATING ||
    room.status === RoomStatus.CONFIRMED ||
    room.status === RoomStatus.CLOSED
  ) {
    throw new ConflictException('ROOM_STATE_CONFLICT');
  }
}

export function isActiveParticipant(participant: Participant): boolean {
  return (
    participant.status === ParticipantStatus.JOINED ||
    participant.status === ParticipantStatus.RESPONDED
  );
}

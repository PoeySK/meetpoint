import {
  isActiveParticipant as isActiveParticipantRecord,
  type ParticipantRecord,
} from '../participant/participant';
import { RoomStatus, type RoomRecord } from './room-status';

export function isRoomEditable(room: Pick<RoomRecord, 'status'>): boolean {
  return (
    room.status !== RoomStatus.CALCULATING &&
    room.status !== RoomStatus.CONFIRMED &&
    room.status !== RoomStatus.CLOSED
  );
}

export function isRoomJoinable(room: Pick<RoomRecord, 'status'>): boolean {
  return room.status === RoomStatus.DRAFT || room.status === RoomStatus.OPEN;
}

export function isActiveParticipant(participant: ParticipantRecord): boolean {
  return isActiveParticipantRecord(participant);
}

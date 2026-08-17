const ROOM_TOKEN_STORAGE_PREFIX = "meetpoint:room-token:";
const ROOM_PARTICIPANT_STORAGE_PREFIX = "meetpoint:room-participant:";

export function getRoomTokenStorageKey(roomId: string) {
  return `${ROOM_TOKEN_STORAGE_PREFIX}${roomId}`;
}

export function getRoomParticipantStorageKey(roomId: string) {
  return `${ROOM_PARTICIPANT_STORAGE_PREFIX}${roomId}`;
}

const ROOM_TOKEN_STORAGE_PREFIX = "meetpoint:room-token:";
const ROOM_PARTICIPANT_STORAGE_PREFIX = "meetpoint:room-participant:";
const ROOM_RECOVERY_STORAGE_PREFIX = "meetpoint:room-recovery-backup:";

// Only an ephemeral backup for the download UI. Persistent recovery uses HttpOnly cookies.
export function getRoomRecoveryStorageKey(roomId: string) {
  return `${ROOM_RECOVERY_STORAGE_PREFIX}${roomId}`;
}

export function rememberRoomAddress(roomCode: string, roomId: string) {
  try { window.localStorage.setItem(`meetpoint:room-address:${roomCode}`, roomId); }
  catch { /* Non-secret address history is optional. */ }
}

export function getRememberedRoomAddress(roomCode: string) {
  try { return window.localStorage.getItem(`meetpoint:room-address:${roomCode}`); }
  catch { return null; }
}

export function getRoomTokenStorageKey(roomId: string) {
  return `${ROOM_TOKEN_STORAGE_PREFIX}${roomId}`;
}

export function getRoomParticipantStorageKey(roomId: string) {
  return `${ROOM_PARTICIPANT_STORAGE_PREFIX}${roomId}`;
}

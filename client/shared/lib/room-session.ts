const ROOM_TOKEN_STORAGE_PREFIX = "meetpoint:room-token:";
const ROOM_PARTICIPANT_STORAGE_PREFIX = "meetpoint:room-participant:";
const ROOM_RECOVERY_STORAGE_PREFIX = "meetpoint:room-recovery-backup:";

// 파일 다운로드용 임시 백업이다. 탭 종료 후 복구에는 HttpOnly 쿠키를 사용한다.
export function getRoomRecoveryStorageKey(roomId: string) {
  return `${ROOM_RECOVERY_STORAGE_PREFIX}${roomId}`;
}

export function rememberRoomAddress(roomCode: string, roomId: string) {
  try { window.localStorage.setItem(`meetpoint:room-address:${roomCode}`, roomId); }
  catch { /* 주소 기록 실패는 접근 권한에 영향을 주지 않는다. */ }
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

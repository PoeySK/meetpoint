import { getRoom, recoverRoomAccess } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { getRoomTokenStorageKey } from "@/shared/lib/room-session";

// 최초 조회와 polling을 합쳐 화면 세션당 자동 복구를 한 번만 시도한다.
export function createRoomAccessRecovery(roomId: string) {
  let attempted = false;
  let pending: Promise<string> | null = null;
  function recover(): Promise<string> {
    if (pending) return pending;
    if (attempted) return Promise.reject(new RoomApiError("복구가 필요합니다.", 401, "RECOVERY_UNAVAILABLE"));
    attempted = true;
    pending = recoverRoomAccess(roomId).then((result) => {
      const token = result.access.participantToken;
      window.sessionStorage.setItem(getRoomTokenStorageKey(roomId), token);
      return token;
    });
    void pending.finally(() => { pending = null; }).catch(() => {});
    return pending;
  }
  return {
    resetAutomaticAttempt() {
      if (!pending) attempted = false;
    },
    async load(storedToken: string | null) {
      let token = storedToken;
      if (!token) token = await recover();
      try { return { room: await getRoom(roomId, token), token }; }
      catch (error) {
        if (!(error instanceof RoomApiError) || error.status !== 401) throw error;
        token = await recover();
        return { room: await getRoom(roomId, token), token };
      }
    },
  };
}

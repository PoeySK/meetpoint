"use client";

import { useState } from "react";
import { recoverRoomAccess, registerRoomRecovery } from "@/entities/room";
import { getRoomRecoveryStorageKey, getRoomTokenStorageKey } from "@/shared/lib/room-session";

export function RoomRecoveryPanel({ roomId, token, onRecovered }: {
  roomId: string; token?: string | null; onRecovered: () => void;
}) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function recover() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await recoverRoomAccess(roomId, code.trim());
      window.sessionStorage.setItem(getRoomTokenStorageKey(roomId), result.access.participantToken);
      setCode("");
      onRecovered();
    } catch {
      setNotice("복구하지 못했습니다. 코드의 만료·폐기 여부와 인터넷 연결을 확인해 주세요. 기존 조건과 응답은 삭제되지 않습니다.");
    } finally { setBusy(false); }
  }

  async function download(replace = false) {
    if (!token || busy) return;
    setBusy(true);
    try {
      const saved = window.sessionStorage.getItem(getRoomRecoveryStorageKey(roomId));
      let recovery: { code: string | null; expiresAt: string } = saved ? JSON.parse(saved) : { code: null, expiresAt: "" };
      if (replace || !recovery.code || Date.parse(recovery.expiresAt) <= Date.now()) {
        if (!window.confirm("새 개인 복구 코드를 발급하면 이전 코드와 다른 브라우저의 복구 정보가 폐기됩니다. 계속할까요?")) return;
        recovery = (await registerRoomRecovery(roomId, token, true)).recovery;
        window.sessionStorage.setItem(getRoomRecoveryStorageKey(roomId), JSON.stringify(recovery));
      }
      const file = new Blob([
        `MeetPoint 개인 복구 정보 — 초대용이 아닙니다. 공유하지 마세요.\n방 주소: ${window.location.origin}/rooms/${roomId}\n복구 코드: ${recovery.code}\n만료: ${recovery.expiresAt}\n방 주소에서 개인 복구 코드를 입력하세요.\n`,
      ], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meetpoint-personal-recovery-${roomId}.txt`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("개인 복구 파일을 안전한 곳에 보관하세요. 파일을 가진 사람은 본인의 방 권한을 사용할 수 있습니다.");
    } catch { setNotice("복구 파일을 보관하지 못했습니다. 브라우저 설정과 연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  return <section className="mp-card space-y-3 p-4">
    <h2 className="font-semibold">기존 참여자 복구</h2>
    {token ? <>
      <p className="text-sm">개인 복구 쿠키는 발급 후 30일에 만료되고 복구해도 만료일은 연장되지 않습니다. 유효한 쿠키가 있으면 탭을 닫아도 같은 방 주소에서 복구할 수 있습니다. 다른 기기나 쿠키 삭제에 대비해 개인 복구 파일을 보관하세요. 초대 링크와 함께 공유하지 마세요.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void download()}>개인 복구 파일 보관</button>
        <button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void download(true)}>복구 코드 재발급</button>
      </div>
    </> : <form onSubmit={(event) => { event.preventDefault(); void recover(); }} className="space-y-2">
      <label className="block text-sm" htmlFor="personal-recovery-code">개인 복구 코드 (초대 방 코드와 다릅니다)</label>
      <input id="personal-recovery-code" type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} required className="w-full rounded border p-2" />
      <button type="submit" className="mp-button mp-button-primary" disabled={busy}>기존 참여자로 복구</button>
      <p className="text-sm">모든 자격 증명을 분실한 HOST는 새 방을 만들어야 합니다. MEMBER의 일반 재입장은 입장이 열린 방에서만 가능하며 새 참여자로 등록됩니다.</p>
    </form>}
    <p aria-live="polite" className="text-sm">{notice}</p>
  </section>;
}

"use client";

import { useState } from "react";
import { RoomApiError } from "@/shared/api/http-client";
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
    } catch (error) {
      setNotice(error instanceof RoomApiError && error.status === 429 ? error.message : "방을 다시 열지 못했어요. 가장 최근에 받은 개인 복구 코드와 인터넷 연결을 확인해 주세요. 전에 저장한 조건과 의견은 그대로 있어요.");
    } finally { setBusy(false); }
  }

  async function download(replace = false) {
    if (!token || busy) return;
    setBusy(true);
    try {
      const saved = window.sessionStorage.getItem(getRoomRecoveryStorageKey(roomId));
      let recovery: { code: string | null; expiresAt: string } = saved ? JSON.parse(saved) : { code: null, expiresAt: "" };
      if (replace || !recovery.code || Date.parse(recovery.expiresAt) <= Date.now()) {
        if (!window.confirm("새 개인 복구 코드를 받으면 예전 코드와 다른 브라우저에 저장된 복구 정보를 더 이상 쓸 수 없어요. 새 코드를 받을까요?")) return;
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
      setNotice("개인 복구 파일을 안전한 곳에 보관해 주세요. 파일을 가진 사람은 내 이름으로 방에 들어올 수 있어요.");
    } catch (error) { setNotice(error instanceof RoomApiError && error.status === 429 ? error.message : "복구 파일을 보관하지 못했습니다. 브라우저 설정과 연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  return <section className="mp-card space-y-3 p-4">
    <h2 className="font-semibold">{token ? "개인 복구 파일 보관" : "이전에 참여한 방 다시 열기"}</h2>
    {token ? <>
      <p className="text-sm">이 브라우저에 저장된 복구 정보는 발급일부터 30일 동안 쓸 수 있어요. 다른 기기에서 이어서 쓰거나 브라우저 데이터를 지우기 전에 개인 복구 파일을 받아 두세요. 파일은 본인만 보관해 주세요.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void download()}>개인 복구 파일 보관</button>
        <button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void download(true)}>새 복구 코드 받기</button>
      </div>
    </> : <form onSubmit={(event) => { event.preventDefault(); void recover(); }} className="space-y-2">
      <label className="block text-sm" htmlFor="personal-recovery-code">개인 복구 코드 (초대 방 코드와 다릅니다)</label>
      <input id="personal-recovery-code" type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} required className="w-full rounded border p-2" />
      <button type="submit" className="mp-button mp-button-primary" disabled={busy}>개인 복구 코드로 방 열기</button>
      <p className="text-sm">개인 복구 코드로 열면 이전에 저장한 조건과 의견을 이어서 쓸 수 있어요. 일반 방 코드는 새 참여자로 입장할 때 쓰는 코드예요.</p>
      <p className="text-sm">브라우저의 복구 정보와 개인 코드를 모두 잃었다면, 방장은 새 방을 만들어야 해요. 참여자는 새 입장이 가능한 방에 다시 들어갈 수 있어요.</p>
    </form>}
    <p aria-live="polite" className="text-sm">{notice}</p>
  </section>;
}

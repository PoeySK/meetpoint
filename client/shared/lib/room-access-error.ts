import { RoomApiError } from '@/shared/api/http-client';

export function getRoomAccessErrorMessage(error: unknown): string | null {
  if (!(error instanceof RoomApiError) || error.status !== 401) return null;

  const reason = error.code === 'TOKEN_EXPIRED'
    ? '방 입장 정보가 만료됐어요.'
    : error.code === 'MISSING_TOKEN'
      ? '이 브라우저에 방 입장 정보가 없어요.'
      : '방 입장 정보를 확인하지 못했어요.';
  return `${reason} ‘다시 불러오기’를 먼저 눌러 주세요. 그래도 방이 열리지 않으면 보관해 둔 개인 복구 코드를 입력해 주세요. 방을 다시 열면 하던 작업을 직접 다시 시도해 주세요.`;
}

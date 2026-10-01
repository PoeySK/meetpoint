import { RoomApiError } from '@/shared/api/http-client';

export function getRoomAccessErrorMessage(error: unknown): string | null {
  if (!(error instanceof RoomApiError) || error.status !== 401) return null;

  const reason = error.code === 'TOKEN_EXPIRED'
    ? '방 접근 토큰이 만료되었습니다.'
    : error.code === 'INVALID_TOKEN'
      ? '방 접근 토큰이 유효하지 않습니다.'
      : error.code === 'MISSING_TOKEN'
        ? '방 접근 토큰이 없습니다.'
        : '방 접근 정보를 확인하지 못했습니다.';
  return `${reason} 방 상단의 ‘다시 불러오기’로 기존 참여자의 접근을 확인해 주세요. 복구가 안 되면 ‘기존 참여자 복구’에서 개인 복구 코드를 입력하세요. 복구 후 원래 작업을 다시 시도해 주세요. 실패한 요청은 자동으로 다시 보내지 않습니다. 일반 방 코드 입장은 기존 권한 복구가 아닙니다.`;
}

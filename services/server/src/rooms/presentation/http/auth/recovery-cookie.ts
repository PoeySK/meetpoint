import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';

export function recoveryCookieName(roomId: string) {
  return `meetpoint_recovery_${roomId}`;
}

export function assertRecoveryOrigin(
  origin: string | undefined,
  required = false
) {
  const allowed = (process.env.CLIENT_ORIGIN ?? 'http://localhost:10081')
    .split(',')
    .map((value) => value.trim());
  if ((required && !origin) || (origin && !allowed.includes(origin))) {
    throw new ForbiddenException('FORBIDDEN');
  }
}

export function readRecoveryCookie(roomId: string, cookie?: string) {
  return cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${recoveryCookieName(roomId)}=`))
    ?.slice(recoveryCookieName(roomId).length + 1);
}

export function setRecoveryCookie(
  response: Response,
  roomId: string,
  code: string,
  expiresAt: Date
) {
  response.setHeader('Cache-Control', 'no-store');
  response.cookie(recoveryCookieName(roomId), code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: `/api/v1/rooms/${roomId}/recovery`,
    expires: expiresAt,
  });
}

import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AccessTokenPort } from '../../application/ports/room-access.port';

const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AccessTokenAdapter implements AccessTokenPort {
  issue(): {
    token: string;
    tokenHash: string;
    tokenExpiresAt: Date;
  } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenHash: this.hash(token),
      tokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

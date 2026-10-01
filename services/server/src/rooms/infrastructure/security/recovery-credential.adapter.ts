import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { RecoveryCredentialPort } from '../../application/ports/recovery-credential.port';

@Injectable()
export class RecoveryCredentialAdapter implements RecoveryCredentialPort {
  issue() {
    const code = randomBytes(32).toString('base64url');
    return {
      code,
      hash: this.hash(code),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  hash(code: string) {
    return createHash('sha256')
      .update(`meetpoint:recovery:${code}`)
      .digest('hex');
  }
}

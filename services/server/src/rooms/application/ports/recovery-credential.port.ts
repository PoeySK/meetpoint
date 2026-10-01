export const RECOVERY_CREDENTIAL = Symbol('RECOVERY_CREDENTIAL');

export interface RecoveryCredentialPort {
  issue(): { code: string; hash: string; expiresAt: Date };
  hash(code: string): string;
}

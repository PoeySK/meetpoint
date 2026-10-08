import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

export type Limit = { scope: string; maximum: number; windowMs: number };

export const ROOM_LIMITS = {
  create: { scope: 'create-ip', maximum: 10, windowMs: 600000 },
  join: { scope: 'join-ip', maximum: 30, windowMs: 600000 },
  recovery: { scope: 'recovery-ip', maximum: 30, windowMs: 600000 },
  writes: { scope: 'writes-ip', maximum: 180, windowMs: 60000 },
  calculationIp: { scope: 'calculation-ip', maximum: 30, windowMs: 60000 },
  condition: { scope: 'condition-actor', maximum: 10, windowMs: 60000 },
  response: { scope: 'response-actor', maximum: 30, windowMs: 60000 },
  register: { scope: 'register-actor', maximum: 6, windowMs: 600000 },
  calculation: { scope: 'calculation-room', maximum: 6, windowMs: 60000 },
} satisfies Record<string, Limit>;

@Injectable()
export class RoomRateLimiter implements OnModuleDestroy {
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private readonly secret = randomBytes(32);
  private readonly maximumEntries = 10000;
  private nextCleanup = 0;
  private readonly timer = setInterval(() => this.cleanup(Date.now()), 60000);

  constructor() {
    this.timer.unref();
  }

  consume(limit: Limit, identity: string[]) {
    const now = Date.now();
    if (now >= this.nextCleanup) this.cleanup(now);
    const key = createHmac('sha256', this.secret)
      .update(JSON.stringify([limit.scope, ...identity]))
      .digest('hex');
    let bucket = this.buckets.get(key);
    if (bucket && bucket.expiresAt <= now) {
      this.buckets.delete(key);
      bucket = undefined;
    }
    if (!bucket) {
      if (this.buckets.size >= this.maximumEntries) {
        this.cleanup(now);
        if (this.buckets.size >= this.maximumEntries) {
          const expiresAt = Math.min(
            ...Array.from(this.buckets.values(), (entry) => entry.expiresAt)
          );
          this.reject(expiresAt, now);
        }
      }
      bucket = { count: 0, expiresAt: now + limit.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit.maximum) this.reject(bucket.expiresAt, now);
    bucket.count++;
  }

  private reject(expiresAt: number, now: number): never {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        details: {
          retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
        },
      },
      429
    );
  }

  private cleanup(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
    this.nextCleanup = now + 60000;
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.buckets.clear();
  }
}

import { HttpException } from '@nestjs/common';
import { RoomRateLimiter, ROOM_LIMITS } from './room-rate-limiter';

describe('bounded room rate limits', () => {
  let limiter: RoomRateLimiter;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    limiter = new RoomRateLimiter();
  });
  afterEach(() => {
    limiter.onModuleDestroy();
    jest.useRealTimers();
  });

  it('allows the threshold, rejects excess without extending the window, then releases', () => {
    for (let i = 0; i < 10; i++)
      limiter.consume(ROOM_LIMITS.condition, ['room', 'one']);
    try {
      limiter.consume(ROOM_LIMITS.condition, ['room', 'one']);
      throw new Error('Expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toEqual({
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: 60 },
      });
    }
    jest.advanceTimersByTime(59001);
    expect(() =>
      limiter.consume(ROOM_LIMITS.condition, ['room', 'one'])
    ).toThrow(HttpException);
    jest.advanceTimersByTime(999);
    expect(() =>
      limiter.consume(ROOM_LIMITS.condition, ['room', 'one'])
    ).not.toThrow();
  });

  it('separates actors, rooms, IPs and policy scopes; IP recovery remains shared', () => {
    for (let i = 0; i < 30; i++)
      limiter.consume(ROOM_LIMITS.recovery, ['ip-one']);
    expect(() => limiter.consume(ROOM_LIMITS.recovery, ['ip-one'])).toThrow();
    expect(() =>
      limiter.consume(ROOM_LIMITS.recovery, ['ip-two'])
    ).not.toThrow();
    for (let i = 0; i < 10; i++)
      limiter.consume(ROOM_LIMITS.condition, ['room-one', 'one']);
    expect(() =>
      limiter.consume(ROOM_LIMITS.condition, ['room-one', 'two'])
    ).not.toThrow();
    expect(() =>
      limiter.consume(ROOM_LIMITS.condition, ['room-two', 'one'])
    ).not.toThrow();
    expect(() =>
      limiter.consume(ROOM_LIMITS.response, ['room-one', 'one'])
    ).not.toThrow();
  });

  it('expires idle entries and stores only process-keyed hashes', () => {
    limiter.consume(ROOM_LIMITS.writes, ['192.0.2.1']);
    expect([...limiter['buckets'].keys()]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    jest.advanceTimersByTime(60000);
    expect(limiter['buckets'].size).toBe(0);
  });

  it('fails closed at capacity without evicting existing limits and recovers after expiry', () => {
    for (let i = 0; i < 10000; i++)
      limiter.consume(ROOM_LIMITS.writes, [`ip-${i}`]);
    expect(() => limiter.consume(ROOM_LIMITS.writes, ['new-ip'])).toThrow(
      HttpException
    );
    expect(limiter['buckets'].size).toBe(10000);
    expect(() => limiter.consume(ROOM_LIMITS.writes, ['ip-0'])).not.toThrow();
    jest.advanceTimersByTime(60000);
    expect(() => limiter.consume(ROOM_LIMITS.writes, ['new-ip'])).not.toThrow();
    expect(limiter['buckets'].size).toBe(1);
  });
});

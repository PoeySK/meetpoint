import { normalizeIp, trustedProxy } from './trusted-proxy';
import { validateEnvironment } from './environment';

describe('explicit direct proxy trust', () => {
  it('does not trust headers by default or further proxy hops', () => {
    expect(trustedProxy()('127.0.0.1', 0)).toBe(false);
    const trust = trustedProxy('127.0.0.1, ::1');
    expect(trust('::ffff:127.0.0.1', 0)).toBe(true);
    expect(trust('::1', 1)).toBe(false);
    expect(trust('192.0.2.1', 0)).toBe(false);
  });
  it('normalizes mapped IPv4 and equivalent IPv6 spellings', () => {
    expect(normalizeIp('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(normalizeIp('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1');
  });
  it.each(['true', '*', 'loopback', '10.0.0.0/8', 'localhost', '192.0.2.1,'])(
    'rejects unsafe proxy setting %s',
    (value) => {
      expect(() => validateEnvironment({ TRUSTED_PROXY_IPS: value })).toThrow(
        'TRUSTED_PROXY_IPS'
      );
    }
  );
});

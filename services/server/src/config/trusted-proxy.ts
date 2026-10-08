import { isIP } from 'node:net';

export function normalizeIp(value: string): string {
  const address = value.split('%')[0];
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return 'unknown';
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function trustedProxy(value = '') {
  const trusted = new Set(
    value
      .split(',')
      .filter(Boolean)
      .map((ip) => normalizeIp(ip.trim()))
  );
  // Exactly the directly connected, explicitly named proxy is trusted.
  return (ip: string, hop: number) => hop === 0 && trusted.has(normalizeIp(ip));
}

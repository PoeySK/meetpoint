/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GET, POST } = require('../app/api/v1/[...path]/route.ts');

const site = 'https://meetpoint.example.com';
const api = 'http://server:3001';
const secret = 'a'.repeat(64);

function setEnvironment(t, values) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

async function assertApiError(response, status, code, message) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { error: { requestId, ...failure } } = await response.json();
  assert.deepEqual(failure, { code, message, details: {} });
  assert.match(requestId, /^req_[0-9a-f-]{36}$/);
  return requestId;
}

test('forwards recovery requests server-side and preserves cookies and rate-limit responses', async (t) => {
  setEnvironment(t, { API_PROXY_SHARED_SECRET: secret });
  const cookies = ['room=synthetic; Path=/api/v1; Secure; HttpOnly', 'other=synthetic; Path=/; Secure'];
  let upstream;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    upstream = { url, ...init };
    const headers = new Headers({ 'Retry-After': '60', 'Cache-Control': 'public, max-age=60' });
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return Response.json({ error: 'rate limited' }, { status: 429, headers });
  });

  const path = '/api/v1/rooms/test-room/recovery?probe=1';
  const response = await POST(new Request(site + path, {
    method: 'POST',
    body: '{}',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer synthetic-token',
      Cookie: 'room=synthetic',
      Origin: site,
      'X-Real-Ip': '192.0.2.1',
      'X-Forwarded-For': '192.0.2.3',
      'X-MeetPoint-Proxy-Secret': 'incoming-header',
      'X-MeetPoint-Client-Ip': '192.0.2.2',
    },
  }));

  assert.equal(upstream.url.href, api + path);
  assert.equal(upstream.method, 'POST');
  assert.equal(new TextDecoder().decode(upstream.body), '{}');
  assert.equal(upstream.headers.get('origin'), site);
  assert.ok(upstream.headers.get('authorization') === 'Bearer synthetic-token');
  assert.ok(upstream.headers.get('cookie') === 'room=synthetic');
  assert.ok(upstream.headers.get('x-meetpoint-proxy-secret') === secret);
  assert.equal(upstream.headers.get('x-meetpoint-client-ip'), '192.0.2.2');
  assert.equal(upstream.headers.has('x-forwarded-for'), false);
  assert.equal(upstream.headers.has('x-real-ip'), false);
  assert.equal(upstream.redirect, 'error');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.deepEqual(await response.json(), { error: 'rate limited' });
});

test('requires the proxy credential and blocks paths outside the room API prefix', async (t) => {
  setEnvironment(t, { API_PROXY_SHARED_SECRET: undefined });
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
  await assertApiError(await GET(new Request(site + '/api/v1/rooms/test-room')),
    503, 'API_PROXY_UNAVAILABLE', 'API 연결 설정을 확인해 주세요.');

  process.env.API_PROXY_SHARED_SECRET = secret;
  await assertApiError(await GET(new Request(site + '/api/v1/%2Fready')),
    404, 'RESOURCE_NOT_FOUND', '요청 경로를 찾을 수 없습니다.');
  assert.equal(fetch.mock.callCount(), 0);
});

test('returns a contract error with a fresh request ID when the API is unreachable', async (t) => {
  setEnvironment(t, { API_PROXY_SHARED_SECRET: secret });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fixture connection error'); });
  const request = new Request(site + '/api/v1/rooms/test-room');
  const firstId = await assertApiError(await GET(request),
    502, 'API_UPSTREAM_UNAVAILABLE', '서비스에 연결할 수 없습니다.');
  const nextId = await assertApiError(await GET(request),
    502, 'API_UPSTREAM_UNAVAILABLE', '서비스에 연결할 수 없습니다.');
  assert.notEqual(firstId, nextId);
});

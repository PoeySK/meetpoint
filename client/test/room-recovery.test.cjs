/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner loads transpiled TypeScript. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise production TypeScript with Node's test runner, without adding a browser-test framework.
function load(relativePath, imports, globals = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: (name) => name in imports ? imports[name] : require(name),
    ...globals,
  }, { filename });
  return compiled.exports;
}

class RoomApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

function setup({ storedToken = null, recoveryFails = false, rejectedToken = 'expired' } = {}) {
  const storage = new Map(storedToken ? [['room:one', storedToken]] : []);
  const calls = { get: 0, recover: 0 };
  const data = { currentParticipant: { id: 'original', role: 'HOST' }, myResponses: [{ note: 'Kept' }] };
  const { createRoomAccessRecovery } = load('widgets/room/model/room-access-recovery.ts', {
    '@/entities/room': {
      getRoom: async (_roomId, token) => {
        calls.get++;
        if (token === rejectedToken) throw new RoomApiError('Expired', 401, 'TOKEN_EXPIRED');
        return data;
      },
      recoverRoomAccess: async () => {
        calls.recover++;
        await Promise.resolve();
        if (recoveryFails) throw new RoomApiError('Unavailable', 401, 'RECOVERY_UNAVAILABLE');
        return { access: { participantToken: 'new-access' } };
      },
    },
    '@/shared/api/http-client': { RoomApiError },
    '@/shared/lib/room-session': { getRoomTokenStorageKey: (id) => `room:${id}` },
  }, { window: { sessionStorage: { setItem: (key, value) => storage.set(key, value) } } });
  return { createRoomAccessRecovery, controller: createRoomAccessRecovery('one'), calls, storage, data };
}

test('refresh with a valid stored access token keeps the existing participant without recovery', async () => {
  const s = setup({ storedToken: 'valid' });
  const result = await s.controller.load(s.storage.get('room:one'));
  assert.equal(result.room, s.data);
  assert.equal(s.calls.recover, 0);
});

test('expired access automatically recovers, saves the new token and preserves returned data', async () => {
  const s = setup({ storedToken: 'expired' });
  const result = await s.controller.load(s.storage.get('room:one'));
  assert.equal(result.room, s.data);
  assert.equal(s.calls.recover, 1);
  assert.equal(s.storage.has('room:one'), true);
  await s.controller.load(s.storage.get('room:one'));
  assert.equal(s.calls.recover, 1);
});

test('tab reentry with empty sessionStorage recovers using the persistent cookie API', async () => {
  const s = setup();
  const result = await s.controller.load(null);
  assert.equal(result.room.currentParticipant.id, 'original');
  assert.equal(s.calls.recover, 1);
});

test('concurrent loads share recovery and a failed automatic recovery is never retried in a loop', async () => {
  const s = setup({ recoveryFails: true });
  const results = await Promise.allSettled([s.controller.load(null), s.controller.load(null)]);
  assert.equal(results.every((value) => value.status === 'rejected'), true);
  assert.equal(s.calls.recover, 1);
  await assert.rejects(s.controller.load(null), { code: 'RECOVERY_UNAVAILABLE' });
  assert.equal(s.calls.recover, 1);
  assert.equal(s.storage.size, 0);
  assert.equal(s.data.myResponses[0].note, 'Kept');
});

test('a newly issued token rejected by the server does not cause infinite recovery', async () => {
  const s = setup({ rejectedToken: 'new-access' });
  await assert.rejects(s.controller.load(null));
  assert.equal(s.calls.recover, 1);
  await assert.rejects(s.controller.load(null));
  assert.equal(s.calls.recover, 1);
});

test('constructing a recovery controller during SSR does not access browser storage', () => {
  const { createRoomAccessRecovery } = load('widgets/room/model/room-access-recovery.ts', {
    '@/entities/room': {}, '@/shared/api/http-client': { RoomApiError }, '@/shared/lib/room-session': {},
  });
  assert.equal(typeof createRoomAccessRecovery('one').load, 'function');
});

test('explicit retry permits a fresh attempt after failure without automatic loops', async () => {
  const s = setup({ recoveryFails: true });
  await assert.rejects(s.controller.load(null));
  s.controller.resetAutomaticAttempt();
  await assert.rejects(s.controller.load(null));
  assert.equal(s.calls.recover, 2);
});

test('failure UI distinguishes personal recovery from creating a new MEMBER', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { RoomRecoveryPanel } = load('features/room-recovery/ui/room-recovery-panel.tsx', {
    '@/entities/room': {}, '@/shared/lib/room-session': {},
  });
  const html = renderToStaticMarkup(React.createElement(RoomRecoveryPanel, { roomId: 'one', onRecovered() {} }));
  assert.equal(html.includes('개인 복구 코드'), true);
  assert.equal(html.includes('분실한 HOST는 새 방'), true);
  assert.equal(html.includes('새 참여자로 등록'), true);
  assert.equal(html.includes('type="password"'), true);
});

test('recovery API includes browser credentials and serializes concurrent requests', async () => {
  let calls = 0;
  let receivedOptions;
  const { request } = load('shared/api/http-client.ts', {}, { process: { env: {} }, fetch: async (_url, options) => {
    calls++;
    receivedOptions = options;
    return { ok: true, json: async () => ({ access: { participantToken: 'issued' } }) };
  } });
  const { recoverRoomAccess } = load('entities/room/api/room-api.ts', { '@/shared/api/http-client': { request } });
  await Promise.all([recoverRoomAccess('one'), recoverRoomAccess('one')]);
  assert.equal(calls, 1);
  assert.equal(receivedOptions.credentials, 'include');
  assert.equal(receivedOptions.body, '{}');
});

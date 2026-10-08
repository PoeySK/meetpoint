/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, imports, globals = {}, exposed = []) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8') + (exposed.length ? `\nexport { ${exposed.join(', ')} };` : ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: (name) => name in imports ? imports[name] : exposed.length && name.startsWith('@/') ? {} : require(name),
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
    '@/shared/api/http-client': { RoomApiError },
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

const accessErrors = load('shared/lib/room-access-error.ts', { '@/shared/api/http-client': { RoomApiError } });
test('all six feature error messages separate expiry/invalid access from permission or network failures', () => {
  const features = [
    ['features/participant-response/ui/participant-response-panel.tsx', 'describeResponseError'],
    ['features/participant-condition/ui/participant-condition-panel.tsx', 'describeConditionError'],
    ['features/candidate-management/ui/candidate-management-panel.tsx', 'describeCandidateError'],
    ['features/calculation/ui/calculation-result-panel.tsx', 'describeCalculationError'],
    ['features/decision-confirmation/model/use-decision-confirmation.ts', 'describeDecisionError'],
    ['features/participant-lifecycle/model/use-participant-lifecycle.ts', 'describeLifecycleError'],
  ];
  for (const [file, name] of features) {
    const describe = load(file, { '@/shared/api/http-client': { RoomApiError }, '@/shared/lib/room-access-error': accessErrors, './calculation-result-view': {} }, {}, [name])[name];
    for (const [code, reason] of [['TOKEN_EXPIRED', '만료'], ['INVALID_TOKEN', '유효하지'], ['MISSING_TOKEN', '없습니다']]) {
      const message = describe(new RoomApiError('Fixture', 401, code));
      assert.match(message, new RegExp(reason), file); assert.match(message, /다시 불러오기/, file);
      assert.match(message, /개인 복구 코드/, file); assert.match(message, /기존 권한 복구가 아닙니다/, file);
      assert.match(message, /자동으로 다시 보내지 않습니다/, file);
      assert.doesNotMatch(message, /이름을 입력해 다시 입장/, file);
    }
    for (const error of [new Error('Fixture network'), new RoomApiError('Fixture forbidden', 403, 'HOST_ONLY')]) {
      assert.doesNotMatch(describe(error), /개인 복구 코드|토큰이 만료/, file);
    }
    const limited = new RoomApiError('요청이 너무 많습니다. 60초 뒤에 다시 시도해 주세요.', 429, 'RATE_LIMITED');
    assert.equal(describe(limited), limited.message, file);
    assert.equal(accessErrors.getRoomAccessErrorMessage(limited), null);
  }
});

test('common API parses Retry-After seconds/date and missing headers without retrying', async () => {
  const fixedDate = class extends Date { static now() { return 1000000; } };
  for (const [header, seconds] of [['60', 60], [new Date(1030000).toUTCString(), 30], [null, undefined], ['invalid', undefined], ['0', undefined]]) {
    let calls = 0;
    const api = load('shared/api/http-client.ts', {}, {
      Date: fixedDate, process: { env: {} }, fetch: async () => {
        calls++;
        return { ok: false, status: 429, headers: { get: () => header }, json: async () => ({ error: {
          code: 'RATE_LIMITED', message: 'Server message', details: {}, requestId: 'req_fixture',
        } }) };
      },
    });
    await assert.rejects(api.request('/fixture'), error => {
      assert.equal(error.status, 429); assert.equal(error.code, 'RATE_LIMITED');
      assert.equal(error.requestId, 'req_fixture'); assert.equal(error.retryAfterSeconds, seconds);
      assert.match(error.message, /다시 시도/); return true;
    });
    assert.equal(calls, 1);
  }
});

test('429 never triggers access recovery or changes stored credentials', async () => {
  let recoveryCalls = 0;
  let storageWrites = 0;
  const limited = new RoomApiError('요청이 너무 많습니다. 60초 뒤에 다시 시도해 주세요.', 429, 'RATE_LIMITED');
  const { createRoomAccessRecovery } = load('widgets/room/model/room-access-recovery.ts', {
    '@/entities/room': { getRoom: async () => { throw limited; }, recoverRoomAccess: async () => { recoveryCalls++; } },
    '@/shared/api/http-client': { RoomApiError },
    '@/shared/lib/room-session': { getRoomTokenStorageKey: () => 'token' },
  }, { window: { sessionStorage: { setItem: () => { storageWrites++; } } } });
  await assert.rejects(createRoomAccessRecovery('one').load('stored-token'), error => error === limited);
  assert.equal(recoveryCalls, 0); assert.equal(storageWrites, 0);
});
test('MAYBE result explanation displays 보류 while other recommendation meanings remain unchanged', () => {
  const { getCalculationCodeLabel } = load('features/calculation/ui/calculation-result-view.tsx', {});
  assert.match(getCalculationCodeLabel('MAYBE_RESPONSE'), /보류/);
});

function sessionHarness() {
  const slots = [], effects = [], timers = [], intervals = new Map();
  let cursor = 0, effectIndex = 0, expired = false, failRecovery = false;
  const calls = { get: 0, recover: 0 };
  const storage = new Map([['token:one', 'fixture-valid']]);
  const room = { room: { id: 'one', status: 'OPEN' }, currentParticipant: { id: 'original', role: 'HOST' }, myCondition: { updatedAt: 'unchanged' }, myResponses: [{ note: 'Stored' }] };
  const data = { latestScoreResult: { id: 'result', status: 'COMPLETED' }, decision: { id: 'decision' } };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = effectIndex++; if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; } },
  };
  const globals = { window: {
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: (fn) => { const id = intervals.size + 1; intervals.set(id, fn); return id; }, clearInterval: (id) => intervals.delete(id),
  }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } };
  const controller = load('widgets/room/model/room-access-recovery.ts', {
    '@/entities/room': {
      getRoom: async () => { calls.get++; if (expired) throw new RoomApiError('Fixture expired', 401, 'TOKEN_EXPIRED'); return room; },
      recoverRoomAccess: async () => { calls.recover++; if (failRecovery) throw new RoomApiError('Fixture recovery failure', 401, 'RECOVERY_UNAVAILABLE'); expired = false; return { access: { participantToken: 'fixture-recovered' } }; },
    }, '@/shared/api/http-client': { RoomApiError }, '@/shared/lib/room-session': { getRoomTokenStorageKey: (id) => `token:${id}` },
  }, globals);
  const { useRoomSession } = load('widgets/room/model/use-room-session.ts', {
    react: hooks, '@/entities/room': { registerRoomRecovery: async () => ({ recovery: { code: null } }) },
    '@/shared/api/http-client': { RoomApiError }, '@/shared/lib/room-access-error': accessErrors,
    '@/shared/lib/room-session': { getRoomTokenStorageKey: (id) => `token:${id}` },
    './room-access-recovery': controller, './room-session-data': { loadRoomSessionData: async () => data },
  }, globals);
  function render() { cursor = 0; effectIndex = 0; return useRoomSession('one'); }
  return { render, calls, room, data, storage, expire(fails = false) { expired = true; failRecovery = fails; }, restoreManually() { expired = false; storage.set('token:one', 'fixture-manual'); }, flush() { while (timers.length) timers.shift()(); }, poll() { for (const fn of intervals.values()) fn(); } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('explicit reload and personal recovery keep mounted room/condition/response/result state on success and failure', async () => {
  const h = sessionHarness(); h.render(); h.flush(); await settle();
  let session = h.render(); assert.equal(session.room, h.room); assert.equal(session.isLoading, false);
  const retry = session.retryRoom(); session = h.render();
  assert.equal(session.isLoading, false); assert.equal(session.room, h.room);
  await retry;
  h.expire(true); await h.render().refreshRoom(); session = h.render();
  assert.equal(session.refreshError.requiresRecovery, true);
  assert.equal(session.room, h.room); assert.equal(session.latestScoreResult, h.data.latestScoreResult); assert.equal(session.decision, h.data.decision);
  const requests = h.calls.get; h.poll(); h.poll(); await settle(); assert.equal(h.calls.get, requests); assert.equal(h.calls.recover, 1);
  await session.retryRoom(); session = h.render(); assert.equal(h.calls.recover, 2);
  assert.equal(session.error, null); assert.equal(session.room, h.room); assert.equal(session.isLoading, false);
  h.restoreManually(); await session.loadRoom(); session = h.render();
  assert.equal(session.refreshError, null); assert.equal(session.participantId, 'original'); assert.equal(session.accessToken, 'fixture-manual');
  assert.equal(session.room.myCondition, h.room.myCondition); assert.equal(session.room.myResponses, h.room.myResponses);
  h.expire(); await session.refreshRoom(); assert.equal(h.calls.recover, 2); // 수동 조회는 자동 복구 횟수를 초기화하지 않는다.
});
test('loaded room exposes the existing explicit retry action and keeps the workspace during recovery', () => {
  const workspace = () => null; const recovery = () => null; let retries = 0;
  const session = { room: { currentParticipant: {} }, accessToken: 'fixture', participantId: 'original', isLoading: false, error: null, refreshError: { requiresRecovery: true, message: 'Fixture' }, retryRoom: () => { retries++; }, loadRoom() {} };
  const { RoomWidget } = load('widgets/room/ui/room-widget.tsx', {
    react: { useCallback: (fn) => fn }, 'next/navigation': { useRouter: () => ({}) }, 'next/link': () => null,
    '@/features/participant-lifecycle': { useParticipantLifecycle: () => ({}) }, '@/features/room-recovery': { RoomRecoveryPanel: recovery },
    '@/shared/lib/room-session': {}, '@/widgets/room-participants': { RoomParticipantsWidget: () => null }, '@/widgets/room-workspace': { RoomWorkspaceWidget: workspace },
    '../model/use-room-session': { useRoomSession: () => session }, './room-load-state': {}, './room-summary': { RoomSummary: () => null },
  });
  function flatten(node, result = []) { if (!node || typeof node !== 'object') return result; if (Array.isArray(node)) node.forEach((child) => flatten(child, result)); else { result.push(node); flatten(node.props?.children, result); } return result; }
  const tree = flatten(RoomWidget({ roomId: 'one' }));
  tree.find((node) => node.type === 'button' && node.props.children === '다시 불러오기').props.onClick(); assert.equal(retries, 1);
  assert.equal(tree.some((node) => node.type === workspace), true); assert.equal(tree.find((node) => node.type === recovery).props.token, null);
});

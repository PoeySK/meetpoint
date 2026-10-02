/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const compiled = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: (name) => name in imports ? imports[name] : require(name), ...globals,
  }, { filename });
  return compiled.exports;
}
const model = load('features/participant-response/model/response-form.ts', {
  '@/shared/config/meetpoint': { MEETPOINT_TIMEZONE: 'Asia/Seoul' },
});
class RoomApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
const accessErrors = load('shared/lib/room-access-error.ts', { '@/shared/api/http-client': { RoomApiError } });
const candidate = (id = 'one', start = '2026-10-02T09:00:00Z', end = '2026-10-02T10:00:00Z') => ({
  id, status: 'ACTIVE', time: { startsAt: start, endsAt: end, timezone: 'Asia/Seoul' },
  place: { name: id, address: 'Test address', area: 'Test' },
  displayOrder: 1, estimatedCostPerPersonKrw: 12000, tags: [' indoor ', 'SMOKING'], version: 1,
});
const condition = () => ({
  participantId: 'participant', submittedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  availabilityWindows: [{ startsAt: '2026-10-02T08:00:00Z', endsAt: '2026-10-02T11:00:00Z' }],
  maxBudgetKrw: null, preferences: { requiredTags: [], preferredTags: [], avoidTags: [] },
});
const response = (id = 'one') => ({
  id: `response-${id}`, candidateId: id, participantId: 'participant',
  availabilityStatus: 'UNAVAILABLE', travelBurden: 'HARD', note: 'Stored note', status: 'SUBMITTED',
});

test('full containment and exact boundaries are available; offsets represent the same instant', () => {
  const c = condition();
  assert.equal(model.getTimeMatch(candidate(), c), 'inside');
  c.availabilityWindows = [{ startsAt: '2026-10-02T18:00:00+09:00', endsAt: '2026-10-02T19:00:00+09:00' }];
  assert.equal(model.getTimeMatch(candidate(), c), 'inside');
});
test('partial overlap/outside stay maybe; independent windows are never merged', () => {
  const c = condition();
  c.availabilityWindows = [{ startsAt: '2026-10-02T09:30:00Z', endsAt: '2026-10-02T11:00:00Z' }];
  assert.equal(model.getTimeMatch(candidate(), c), 'outside');
  assert.equal(model.getTimeMatch(candidate('outside', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z'), c), 'outside');
  c.availabilityWindows = [
    { startsAt: '2026-10-02T09:00:00Z', endsAt: '2026-10-02T09:30:00Z' },
    { startsAt: '2026-10-02T09:30:00Z', endsAt: '2026-10-02T10:00:00Z' },
  ];
  assert.equal(model.getTimeMatch(candidate(), c), 'outside');
  c.availabilityWindows.push(condition().availabilityWindows[0]);
  assert.equal(model.getTimeMatch(candidate(), c), 'inside');
});
test('missing, invalid, reversed and timezone-less timestamps stay maybe', () => {
  for (const invalid of ['invalid', '', '2026-10-02T09:00:00', '2026-10-02T12:00:00Z']) {
    assert.equal(model.getTimeMatch(candidate('one', invalid), condition()), 'unknown');
  }
  const c = condition(); c.availabilityWindows = [];
  assert.equal(model.getTimeMatch(candidate(), c), 'unknown');
  c.availabilityWindows = [{ startsAt: 'invalid', endsAt: 'invalid' }];
  assert.equal(model.fillFormsFromCondition({}, [candidate()], [], c).forms.one.availabilityStatus, 'MAYBE');
});
test('budget and normalized required/avoid tags explain conflicts without changing availability', () => {
  const c = condition();
  c.maxBudgetKrw = 10000;
  c.preferences = { requiredTags: [' Indoor ', 'PARKING'], preferredTags: ['Missing preferred'], avoidTags: [' smoking '] };
  const warnings = model.getConditionWarnings(candidate(), c);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /10,000/);
  assert.match(warnings[1], /PARKING/);
  assert.doesNotMatch(warnings[1], /Indoor/);
  assert.match(warnings[2], /smoking/);
  assert.equal(model.fillFormsFromCondition({}, [candidate()], [], c).forms.one.availabilityStatus, 'AVAILABLE');
  c.maxBudgetKrw = null; c.preferences.requiredTags = []; c.preferences.avoidTags = [];
  assert.equal(model.getConditionWarnings(candidate(), c).length, 0);
});
test('default maybe is missing and clean, with no travel default or saved identity', () => {
  const form = model.createResponseForm();
  assert.equal(form.availabilityStatus, 'MAYBE');
  assert.equal(form.travelBurden, null);
  assert.equal(model.isFormDirty(form), false);
  assert.equal(model.getResponseState(form), 'missing');
  assert.equal(model.getMissingFieldsMessage(form), '이동 부담을 선택해 주세요.');
});
test('fill skips saved, manually edited, submitting and archived candidates; retains memo/travel', () => {
  const cs = ['one', 'saved', 'manual', 'busy', 'archived'].map((id) => candidate(id));
  cs[4].status = 'ARCHIVED';
  const forms = model.createInitialForms(cs, [response('saved')]);
  forms.one.note = 'Kept'; forms.one.travelBurden = 'NORMAL';
  forms.manual = model.editResponseForm(forms.manual, { availabilityStatus: 'MAYBE' });
  forms.busy.isSubmitting = true;
  const result = model.fillFormsFromCondition(forms, cs, [response('saved')], condition());
  assert.equal(result.applied, 1); assert.equal(result.excluded, 3);
  assert.equal(result.forms.one.note, 'Kept'); assert.equal(result.forms.one.travelBurden, 'NORMAL');
  assert.equal(result.forms.one.savedResponseId, null);
  for (const id of ['saved', 'manual', 'busy', 'archived']) assert.equal(result.forms[id], forms[id]);
  assert.equal(model.fillFormsFromCondition(forms, cs, [], condition(), true).applied, 0);
  assert.equal(model.fillFormsFromCondition(forms, cs, [], null).applied, 0);
});
test('polling preserves automatic/manual drafts; latest warnings and stale reasons track conditions and time', () => {
  const cs = [candidate(), candidate('manual')];
  let forms = model.fillFormsFromCondition({}, cs, [], condition()).forms;
  forms.manual = model.editResponseForm(forms.manual, { availabilityStatus: 'UNAVAILABLE', note: 'Manual' });
  const incoming = model.synchronizeResponseForms(forms, [...cs, candidate('new')], [response()]);
  assert.equal(incoming.one, forms.one); assert.equal(incoming.manual, forms.manual);
  assert.equal(incoming.new.availabilityStatus, 'MAYBE');
  const changed = condition(); changed.maxBudgetKrw = 0;
  assert.match(model.getAutoFillDescription(forms.one, cs[0], changed), /変|바뀌었습니다/);
  assert.match(model.getConditionWarnings(cs[0], changed)[0], /예산/);
  const changedCandidate = candidate('one', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z');
  assert.match(model.getAutoFillDescription(forms.one, changedCandidate, condition()), /바뀌었습니다/);
  const reapplied = model.fillFormsFromCondition(forms, [changedCandidate, cs[1]], [], condition());
  assert.equal(reapplied.forms.one.availabilityStatus, 'MAYBE');
  assert.match(model.getAutoFillDescription(reapplied.forms.one, changedCandidate, condition()), /밖이어서/);
  assert.equal(reapplied.forms.manual, forms.manual);
});

function panelHarness({ saved = [], criteria = condition(), readOnly = false } = {}) {
  const states = [], effects = [], timers = [];
  let index = 0, effectIndex = 0, fail = false, pending = null, release = null;
  const calls = [];
  const hooks = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useEffect(callback, deps) { const i = effectIndex++; if (!effects[i] || deps.some((dep, j) => dep !== effects[i][j])) { effects[i] = deps; callback(); } },
  };
  const imports = { '@/features/participant-response/model/response-form': model };
  const card = load('features/participant-response/ui/candidate-response-card.tsx', imports);
  const quick = load('features/participant-response/ui/quick-response-panel.tsx', imports);
  const { ParticipantResponsePanel } = load('features/participant-response/ui/participant-response-panel.tsx', {
    ...imports, react: hooks,
    '@/features/participant-response/ui/candidate-response-card': card,
    '@/features/participant-response/ui/quick-response-panel': quick,
    '@/shared/api/http-client': { RoomApiError },
    '@/shared/lib/room-access-error': accessErrors,
    '@/entities/participant-response': { upsertParticipantResponse: async (_room, _participant, id, _token, input) => {
      calls.push({ id, input }); if (fail) throw fail instanceof Error ? fail : new Error('Fixture failure');
      if (pending) await pending;
      return { response: { ...response(id), ...input } };
    } },
  }, { window: { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} } });
  const props = { roomId: 'room', token: 'test-only', participantId: 'participant', candidates: [candidate(), candidate('two')], responses: saved, condition: criteria, isReadOnly: readOnly, onRoomRefresh: async () => {} };
  function nodes(node, result = []) { if (!node || typeof node !== 'object') return result; if (Array.isArray(node)) { node.forEach((n) => nodes(n, result)); return result; } result.push(node); nodes(node.props?.children, result); return result; }
  function render() {
    index = 0; effectIndex = 0;
    const tree = ParticipantResponsePanel(props);
    return nodes(tree);
  }
  const flush = () => { while (timers.length) timers.shift()(); };
  const cards = () => render().filter((node) => node.type === card.CandidateResponseCard);
  const fill = () => render().find((node) => node.type === 'button' && /내 기준으로/.test(node.props.children));
  return { props, calls, cards, fill, render, flush, quick: () => render().find((node) => node.type === quick.QuickResponsePanel), fail(value) { fail = value; }, hold() { pending = new Promise((resolve) => { release = resolve; }); }, release() { release(); pending = null; }, card };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('default and fill do not call API; manual edits are drafts until explicit save', async () => {
  const h = panelHarness(); h.render(); h.flush();
  assert.equal(h.calls.length, 0);
  h.fill().props.onClick();
  assert.equal(h.calls.length, 0);
  let card = h.cards()[0];
  const rendered = h.card.CandidateResponseCard(card.props);
  function find(node, label) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map((n) => find(n, label)).find(Boolean);
    if (node.type === 'button' && node.props.children === label) return node;
    return find(node.props?.children, label);
  }
  find(rendered, '불가').props.onClick();
  card = h.cards()[0];
  find(h.card.CandidateResponseCard(card.props), '보통').props.onClick();
  assert.equal(h.calls.length, 0);
  h.cards()[0].props.onSave(); await settle();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].input.availabilityStatus, 'UNAVAILABLE');
  assert.equal(model.getResponseState(h.cards()[0].props.form), 'saved');
});
test('missing travel blocks saving; failed save preserves draft and can retry', async () => {
  const h = panelHarness(); h.fill().props.onClick();
  h.cards()[0].props.onSave(); await settle(); assert.equal(h.calls.length, 0);
  assert.match(h.cards()[0].props.form.message, /이동 부담/);
  h.cards()[0].props.onUpdate({ travelBurden: 'EASY', note: 'Kept on failure' });
  h.fail(true); h.cards()[0].props.onSave(); await settle();
  let form = h.cards()[0].props.form;
  assert.equal(form.savedResponseId, null); assert.equal(form.note, 'Kept on failure');
  assert.equal(form.availabilityStatus, 'AVAILABLE'); assert.equal(form.isSubmitting, false);
  h.fail(false); h.cards()[0].props.onSave(); await settle();
  assert.equal(model.getResponseState(h.cards()[0].props.form), 'saved');
});
test('read-only/missing criteria disable fill; polling does not overwrite manual or automatic drafts', () => {
  for (const options of [{ criteria: null }, { readOnly: true }]) {
    const h = panelHarness(options); assert.equal(h.fill().props.disabled, true);
    h.fill().props.onClick(); assert.equal(h.cards()[0].props.form.autoFill, null); assert.equal(h.calls.length, 0);
  }
  const h = panelHarness(); h.fill().props.onClick();
  h.cards()[1].props.onUpdate({ availabilityStatus: 'UNAVAILABLE' });
  h.props.responses = [response()]; h.props.condition = { ...condition(), maxBudgetKrw: 0 };
  h.props.candidates = [...h.props.candidates, candidate('new'), { ...candidate('archived'), status: 'ARCHIVED' }];
  h.render(); h.flush();
  assert.equal(h.cards().length, 3); assert.equal(h.cards()[0].props.form.availabilityStatus, 'AVAILABLE');
  assert.equal(h.cards()[1].props.form.availabilityStatus, 'UNAVAILABLE');
  assert.equal(model.getResponseState(h.cards()[2].props.form), 'missing');
  h.fill().props.onClick(); assert.equal(h.cards()[1].props.form.availabilityStatus, 'UNAVAILABLE');
});
test('quick save still submits all active candidates; failed overrides remain available for retry', async () => {
  const h = panelHarness(); h.quick().props.onSave(); assert.equal(h.calls.length, 0);
  h.quick().props.onAvailabilityChange('MAYBE'); h.quick().props.onTravelChange('NORMAL');
  h.fail(true); h.quick().props.onSave(); await settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.cards()[0].props.form.travelBurden, 'NORMAL');
  assert.equal(h.cards()[0].props.form.savedResponseId, null);
  h.fail(false); h.quick().props.onSave(); await settle();
  assert.equal(h.calls.length, 4);
  assert.equal(h.cards().every((card) => model.getResponseState(card.props.form) === 'saved'), true);
  const reload = panelHarness({ saved: h.calls.slice(2).map(({ id, input }) => ({ ...response(id), ...input })) });
  assert.equal(reload.cards().every((card) => model.getResponseState(card.props.form) === 'saved'), true);
});

test('saving disables fill and duplicate save; saved response and manual draft survive reapplication', async () => {
  const h = panelHarness({ saved: [response('two')] });
  h.fill().props.onClick();
  h.cards()[0].props.onUpdate({ travelBurden: 'NORMAL' });
  h.hold(); h.cards()[0].props.onSave();
  assert.equal(h.fill().props.disabled, true);
  h.fill().props.onClick(); h.cards()[0].props.onSave();
  assert.equal(h.calls.length, 1);
  assert.equal(h.cards()[1].props.form.availabilityStatus, 'UNAVAILABLE');
  h.release(); await settle();
  assert.equal(h.cards()[0].props.form.autoFill, null);
  assert.equal(model.getResponseState(h.cards()[0].props.form), 'saved');
});
test('condition conflicts remain visible for unavailable responses and do not claim full match', () => {
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const c = condition(); c.maxBudgetKrw = 0; c.preferences.requiredTags = ['PARKING'];
  const h = panelHarness({ saved: [response()], criteria: c });
  const markup = renderToStaticMarkup(createElement(h.card.CandidateResponseCard, h.cards()[0].props));
  assert.match(markup, /저장된 내 가능 시간 안/);
  assert.match(markup, /예산 한도/); assert.match(markup, /PARKING/);
  assert.doesNotMatch(markup, /완전 일치/);
});

test('condition time warnings use the same UTC containment rules as automatic fill', () => {
  const c = condition();
  c.availabilityWindows = [{ startsAt: '2026-10-02T18:00:00+09:00', endsAt: '2026-10-02T19:00:00+09:00' }];
  assert.equal(model.getConditionWarnings(candidate(), c).length, 0);
  for (const entry of [candidate('partial', '2026-10-02T09:30:00Z', '2026-10-02T10:30:00Z'), candidate('outside', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z')]) {
    assert.equal(model.getTimeMatch(entry, c), 'outside');
    assert.match(model.getConditionWarnings(entry, c)[0], /가능 시간/);
    assert.equal(model.fillFormsFromCondition({}, [entry], [], c).forms[entry.id].availabilityStatus, 'MAYBE');
  }
  assert.equal(model.getTimeMatch(candidate('invalid', 'invalid'), c), 'unknown');
  assert.equal(model.getConditionWarnings(candidate('invalid', 'invalid'), c).length, 0);
  assert.match(model.timeMatchDescription('unknown'), /판단할 수 없습니다/);
});
test('candidate and quick options expose MAYBE as 보류 including accessible pressed selection', () => {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const h = panelHarness();
  assert.equal(model.availabilityOptions.find((option) => option.value === 'MAYBE').label, '보류');
  const cardHtml = renderToStaticMarkup(React.createElement(h.card.CandidateResponseCard, h.cards()[0].props));
  const quick = h.quick(); const quickHtml = renderToStaticMarkup(React.createElement(quick.type, { ...quick.props, availabilityStatus: 'MAYBE' }));
  for (const html of [cardHtml, quickHtml]) { assert.match(html, /aria-pressed="true"[^>]*>보류<\/button>/); assert.doesNotMatch(html, /아마 가능/); }
});
test('authentication failure retains response draft and requires recovery before an explicit retry', async () => {
  const h = panelHarness(); h.fill().props.onClick(); h.cards()[0].props.onUpdate({ travelBurden: 'NORMAL', note: 'Auth failure draft' });
  h.fail(new RoomApiError('Fixture expiry', 401, 'TOKEN_EXPIRED')); h.cards()[0].props.onSave(); await settle();
  const form = h.cards()[0].props.form;
  assert.match(form.message, /토큰이 만료/); assert.match(form.message, /다시 불러오기/); assert.match(form.message, /기존 참여자/);
  assert.equal(form.savedResponseId, null); assert.equal(form.note, 'Auth failure draft');
  h.props.token = 'fixture-recovered-token'; h.render(); h.flush(); await settle();
  assert.equal(h.calls.length, 1);
  h.fail(false); h.cards()[0].props.onSave(); await settle(); assert.equal(h.calls.length, 2);
  assert.equal(model.getResponseState(h.cards()[0].props.form), 'saved');
});

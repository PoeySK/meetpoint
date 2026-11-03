/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

const compiled = { exports: {} };
const filename = path.resolve(__dirname, '../features/calculation/ui/calculation-result-view.tsx');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: compiled, exports: compiled.exports, require }, { filename });
const { CompletedResult, CalculationStatus, groupCandidateIssues } = compiled.exports;

const decisionModule = { exports: {} };
const decisionFilename = path.resolve(__dirname, '../features/decision-confirmation/ui/decision-confirmation-panel.tsx');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(decisionFilename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: decisionModule, exports: decisionModule.exports, require }, { filename: decisionFilename });
const { DecisionConfirmationPanel } = decisionModule.exports;

function fixture() {
  const participant = (id) => ({
    participantId: id, score: 99, components: { time: 30, travelBurden: 35, budget: 19, preference: 15 },
    hardConflicts: ['BUDGET_LIMIT_EXCEEDED'], blockingIssues: [],
    reasons: ['예산: 예산 한도 초과', '이동 부담: 이동 쉬움'],
  });
  const candidate = {
    candidateId: 'one', rank: 1, overallScore: 99, eligible: false, matchLevel: 'CONFLICTED',
    coverage: { submittedResponses: 2, expectedResponses: 2 },
    participantBreakdown: [participant('alice'), participant('bob')], reasons: [],
    conflicts: [{ participantId: 'alice', code: 'BUDGET_LIMIT_EXCEEDED' }, { participantId: 'bob', code: 'BUDGET_LIMIT_EXCEEDED' }],
    blockingIssues: [], explanationFlags: ['SELF_REPORTED_TRAVEL_BURDEN'],
  };
  return {
    calculation: {
      status: 'COMPLETED', metadata: { scoringProfile: 'CONDITION_AWARE', weights: { time: 30, travelBurden: 35, budget: 20, preference: 15 } },
      recommendationStatus: 'NO_FULL_MATCH', recommendationWarnings: [], coverage: { submittedResponses: 4, expectedResponses: 4 },
      candidates: [candidate, { ...candidate, candidateId: 'two', rank: 2 }],
    },
    room: {
      room: { status: 'CALCULATED' }, participants: [{ id: 'alice', displayName: '긴이름'.repeat(10) }, { id: 'bob', displayName: '보라' }],
      candidates: ['one', 'two'].map((id, index) => ({
        id, place: { name: '같은 장소' }, estimatedCostPerPersonKrw: 21000,
        time: { startsAt: `2026-10-10T${index ? '18' : '12'}:00:00+09:00`, endsAt: `2026-10-10T${index ? '20' : '14'}:00:00+09:00`, timezone: 'Asia/Seoul' },
      })),
    },
    isHost: true, selectedCandidateId: 'one', onSelectCandidate() {},
  };
}

test('API components and metadata maxima, reasons, high average conflicts and named targets render in native disclosures', () => {
  const props = fixture();
  props.calculation.candidates[0].conflicts.push({ participantId: 'alice', code: 'BUDGET_LIMIT_EXCEEDED' });
  const html = renderToStaticMarkup(CompletedResult(props));
  for (const text of ['99.0점', '30.0 / 30점', '35.0 / 35점', '19.0 / 20점', '15.0 / 15점', '예산: 예산 한도 초과', '이동 부담: 이동 쉬움', '평균 점수가 높아도', '보라']) assert.ok(html.includes(text));
  assert.equal((html.match(/<details/g) || []).length, 4);
  assert.equal((html.match(/<summary/g) || []).length, 4);
  assert.ok(!html.includes('<details open'));
  const issues = groupCandidateIssues(props.calculation.candidates[0]);
  assert.equal(issues.length, 1);
  assert.deepEqual(Array.from(issues[0].participantIds), ['alice', 'bob']);
});

test('missing response/condition evidence and unknown names stay neutral without exposing IDs or private conditions', () => {
  const props = fixture();
  const c = props.calculation.candidates[0];
  c.participantBreakdown[0] = {
    ...c.participantBreakdown[0], participantId: 'missing-private-uuid', score: 0,
    hardConflicts: [], blockingIssues: ['MISSING_RESPONSE'], reasons: ['예산: 의견 없음'],
  };
  c.participantBreakdown[1].reasons = ['선호하는 특징: 내 기준을 입력하지 않음'];
  const longReason = '긴 근거도 줄임 없이 표시합니다. '.repeat(20);
  c.participantBreakdown[1].reasons.push(longReason);
  c.conflicts = []; c.blockingIssues = ['MISSING_RESPONSE']; c.explanationFlags = ['CONDITION_NOT_PROVIDED', 'MISSING_RESPONSE'];
  props.room.myCondition = { maxBudgetKrw: 987654, preferences: { requiredTags: ['private-tag'] } };
  const html = renderToStaticMarkup(CompletedResult(props));
  for (const text of ['미응답:', '이름을 확인할 수 없는 참가자', '의견 없음', '내 기준을 입력하지 않음', '선택 조건을 입력하지 않았어요']) assert.ok(html.includes(text));
  for (const text of ['missing-private-uuid', '987654', 'private-tag']) assert.ok(!html.includes(text));
  assert.ok(html.includes(longReason.trim()));
});

test('same place candidates show distinct time, timezone and cost; MEMBER cannot select and STALE cannot render results', () => {
  const props = fixture(); props.isHost = false;
  const html = renderToStaticMarkup(CompletedResult(props));
  for (const text of ['같은 장소', '오후 12:00', '오후 6:00', 'Asia/Seoul', '21,000원']) assert.ok(html.includes(text));
  assert.ok(!html.includes('<button'));
  props.calculation.status = 'STALE';
  assert.equal(CompletedResult(props), null);
  assert.match(renderToStaticMarkup(CalculationStatus(props)), /최신 내용이 아닙니다/);
});

test('confirmed summary shows the decision candidate schedule, address and cost to HOST and MEMBER across midnight', () => {
  const decision = {
    status: 'CONFIRMED', overallScore: 91.7, decisionNote: '확정 메모 유지',
    candidate: {
      place: { name: '확정 장소', address: '서울 중구 확정길 28' },
      time: { startsAt: '2026-11-03T14:30:00Z', endsAt: '2026-11-03T16:30:00Z', timezone: 'Asia/Seoul' },
      estimatedCostPerPersonKrw: 28000,
    },
  };
  for (const isHost of [true, false]) {
    const html = renderToStaticMarkup(DecisionConfirmationPanel({ decision, isHost, roomStatus: 'CONFIRMED' }));
    for (const text of ['방장이 일정을 확정했습니다', '확정 장소', '서울 중구 확정길 28', '시작: 2026. 11. 3. 오후 11:30', '종료: 2026. 11. 4. 오전 1:30', 'Asia/Seoul', '1인 예상 비용', '28,000원', '91.7점', '확정 메모 유지']) assert.ok(html.includes(text), text);
    assert.ok(html.includes('dateTime="2026-11-03T14:30:00Z"'));
    assert.equal(html.includes('확정 내용 다시 검토하기'), isHost);
  }
});

test('reopened summary uses the candidate timezone and preserves zero cost and review reason', () => {
  const decision = {
    status: 'REOPENED', overallScore: 85, decisionNote: null, reopenReason: '시간 재검토',
    candidate: {
      place: { name: '다시 검토할 장소', address: '검토할 주소' },
      time: { startsAt: '2026-11-03T04:30:00Z', endsAt: '2026-11-03T06:30:00Z', timezone: 'America/New_York' },
      estimatedCostPerPersonKrw: 0,
    },
  };
  const html = renderToStaticMarkup(DecisionConfirmationPanel({ decision, isHost: false, roomStatus: 'OPEN' }));
  for (const text of ['확정 내용을 다시 검토하는 중입니다', '검토할 주소', '시작: 2026. 11. 2. 오후 11:30', '종료: 2026. 11. 3. 오전 1:30', 'America/New_York', '0원', '시간 재검토', '기록 없음']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('이 후보로 일정 확정'));
});

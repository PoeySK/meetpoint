import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { RoomDetailsResponse } from '../../entities/room';

type Database = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
};
const serverRequire = createRequire(path.resolve(__dirname, '../../../services/server/package.json'));
const PgClient = serverRequire('pg').Client as new (options: { connectionString: string }) => Database;
type World = {
  db: Database;
  page(): Promise<Page>;
  track(roomId: string): void;
  allowResourceErrors(statuses: number[]): void;
};

const test = base.extend<{ world: World }>({
  world: async ({ browser }, provide) => {
    const connectionString = process.env.MEETPOINT_E2E_DATABASE_URL!;
    if (!/^\/meetpoint_browser_test_[a-f0-9]{16}$/.test(new URL(connectionString).pathname)) {
      throw new Error('Browser fixtures require the owned temporary test database.');
    }
    const db = new PgClient({ connectionString });
    await db.connect();
    const contexts: BrowserContext[] = [];
    const rooms: string[] = [];
    let pageErrors = 0;
    let consoleErrors = 0;
    const allowedResourceErrors = new Set([401, 403, 429]);
    try {
      await provide({
        db,
        track: (roomId) => rooms.push(roomId),
        allowResourceErrors: statuses => statuses.forEach(status => allowedResourceErrors.add(status)),
        page: async () => {
          const context = await browser.newContext({ baseURL: process.env.MEETPOINT_E2E_URL, timezoneId: 'Asia/Seoul' });
          contexts.push(context);
          context.on('page', (page) => {
            page.on('pageerror', () => { pageErrors += 1; });
            page.on('console', (message) => {
              // 인증·제한 거부 테스트의 리소스 오류만 제외하고 원문은 저장하지 않는다.
              const resourceError = /^Failed to load resource: the server responded with a status of (\d+)/.exec(message.text());
              if (message.type() === 'error' && (!resourceError || !allowedResourceErrors.has(Number(resourceError[1])))) consoleErrors += 1;
            });
          });
          return context.newPage();
        },
      });
      expect(pageErrors, 'Uncaught browser execution errors').toBe(0);
      expect(consoleErrors, 'Unexpected browser console errors').toBe(0);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      for (const roomId of rooms) await db.query('DELETE FROM rooms WHERE id = $1 AND title LIKE $2', [roomId, 'browser-e2e-%']);
      await db.end();
    }
  },
});

test('429 안내·조건과 의견 초안 유지·인증 복구 미실행·계산 job 차단', async ({ world }) => {
  world.allowResourceErrors([400, 422]);
  const { host, roomId } = await setup(world);
  let recoveryRequests = 0;
  let mutationRequests = 0;
  host.on('request', (request) => {
    if (request.method() === 'POST' && /\/recovery(?:\/register)?$/.test(new URL(request.url()).pathname)) recoveryRequests++;
    if (request.method() === 'PUT') mutationRequests++;
  });
  const current = await room(host);
  async function exhaustQuota(endpoint: string, count: number) {
    const statuses = await host.evaluate(async ({ api, roomId, endpoint, count }) => {
      const statuses: number[] = [];
      for (let i = 0; i < count; i++) {
        const response = await fetch(`${api}/api/v1/rooms/${roomId}/${endpoint}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(`meetpoint:room-token:${roomId}`)}` },
          body: '{}',
        });
        statuses.push(response.status);
      }
      return statuses;
    }, { api: process.env.MEETPOINT_E2E_API_URL!, roomId, endpoint, count });
    expect(statuses.every(status => status === 400 || status === 422)).toBe(true);
  }
  await exhaustQuota(`participants/${current.currentParticipant.id}/conditions`, 9);
  const condition = section(host, '원하는 조건을 알려주세요');
  await condition.getByLabel('1인 최대 예산 (원)', { exact: true }).fill('23456');
  await action(host, condition.getByRole('button', { name: '선택 조건 수정 저장', exact: true }), 'PUT', /\/conditions$/, 429);
  await expect(condition).toContainText(/\d+초 뒤에 다시 시도해 주세요/);
  await expect(condition.getByLabel('1인 최대 예산 (원)', { exact: true })).toHaveValue('23456');
  expect((await room(host)).myCondition!.maxBudgetKrw).toBe(20000);
  await exhaustQuota(`participants/${current.currentParticipant.id}/responses/${current.candidates[0].id}`, 30);
  const card = opinion(host, 'E2E inside');
  await card.getByRole('button', { name: '가능', exact: true }).click();
  await card.getByRole('button', { name: '편함', exact: true }).click();
  await card.getByLabel(/^메모/).fill('429 뒤에도 보존할 초안');
  const save = card.getByRole('button', { name: /^(의견 저장|변경 저장)$/ });
  await action(host, save, 'PUT', /\/responses\//, 429);
  await expect(card).toContainText(/\d+초 뒤에 다시 시도해 주세요/);
  await expect(card.getByLabel(/^메모/)).toHaveValue('429 뒤에도 보존할 초안');
  expect((await room(host)).myResponses.length).toBe(0);
  expect(mutationRequests).toBe(41);
  expect(recoveryRequests).toBe(0);
  // Wait for normal polling; no automatic mutation retry and both drafts remain.
  await host.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/rooms/${roomId}` && response.status() === 200);
  await expect(card.getByLabel(/^메모/)).toHaveValue('429 뒤에도 보존할 초안');
  await expect(condition.getByLabel('1인 최대 예산 (원)', { exact: true })).toHaveValue('23456');
  expect(mutationRequests).toBe(41);

  // Real Server quota: valid HOST authentication, invalid body consumes requests without jobs.
  const statuses = await host.evaluate(async ({ api, roomId }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${api}/api/v1/rooms/${roomId}/calculations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(`meetpoint:room-token:${roomId}`)}` },
        body: JSON.stringify({ clientRequestId: '' }),
      });
      statuses.push(response.status);
    }
    return statuses;
  }, { api: process.env.MEETPOINT_E2E_API_URL!, roomId });
  expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
  await action(host, host.getByRole('button', { name: '추천 결과 만들기', exact: true }), 'POST', /\/calculations$/, 429);
  await expect(section(host, '모임 추천 결과 확인')).toContainText(/\d+초 뒤에 다시 시도해 주세요/);
  expect((await room(host)).room.latestScoreResultId).toBeNull();
  expect((await world.db.query('SELECT count(*)::int AS count FROM calculation_jobs WHERE "roomId" = $1', [roomId])).rows[0].count).toBe(0);
  expect(recoveryRequests).toBe(0);
});

function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).last();
}
function opinion(page: Page, name: string) {
  return section(page, '후보별 의견').getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
}
function result(page: Page, name: string) {
  return section(page, '모임 추천 결과 확인').getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
}
async function room(page: Page): Promise<RoomDetailsResponse> {
  return page.evaluate(async (api) => {
    const roomId = window.location.pathname.split('/').pop()!;
    const response = await fetch(`${api}/api/v1/rooms/${roomId}`, {
      credentials: 'include', headers: { Authorization: `Bearer ${sessionStorage.getItem(`meetpoint:room-token:${roomId}`)}` },
    });
    if (!response.ok) throw new Error('Public Room verification failed.');
    return response.json();
  }, process.env.MEETPOINT_E2E_API_URL!);
}
async function action(page: Page, locator: Locator, method: string, endpoint: RegExp, status: number) {
  const response = page.waitForResponse((item) => item.request().method() === method && endpoint.test(new URL(item.url()).pathname));
  await locator.click();
  expect((await response).status(), 'Action response status').toBe(status);
}
async function addCandidate(page: Page, name: string, second: boolean) {
  const management = section(page, '모임 후보 관리');
  await management.getByRole('button', { name: '내일', exact: true }).click();
  await management.getByRole('button', { name: second ? '저녁 18:00~20:00' : '점심 12:00~14:00', exact: true }).click();
  await management.getByLabel('장소명', { exact: true }).fill(name);
  await management.getByLabel('지역', { exact: true }).fill('중구');
  await management.getByLabel('주소', { exact: true }).fill('서울 중구 테스트길 1');
  await management.getByLabel('1인 예상 비용 (원)', { exact: true }).fill(second ? '40000' : '10000');
  await management.getByLabel('특징', { exact: true }).fill(second ? '야외' : '실내, 카페');
  await action(page, management.getByRole('button', { name: '후보 등록', exact: true }), 'POST', /\/candidates$/, 201);
  await expect(opinion(page, name)).toBeVisible();
}
async function saveCondition(page: Page) {
  const current = await room(page);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(current.candidates[0].time.startsAt));
  const condition = section(page, '원하는 조건을 알려주세요');
  await condition.getByLabel('날짜', { exact: true }).fill(date);
  await condition.getByLabel('시작', { exact: true }).fill('12:00');
  await condition.getByLabel('종료', { exact: true }).fill('14:00');
  await condition.getByLabel('예산 제한 없음', { exact: true }).uncheck();
  await condition.getByLabel('1인 최대 예산 (원)', { exact: true }).fill('20000');
  await condition.getByLabel('꼭 필요한 특징', { exact: true }).fill('실내');
  await condition.getByLabel('있으면 좋은 특징', { exact: true }).fill('카페');
  await condition.getByLabel('피하고 싶은 특징', { exact: true }).fill('야외');
  await action(page, condition.getByRole('button', { name: '선택 조건 저장', exact: true }), 'PUT', /\/conditions$/, 200);
  await expect(section(page, '후보별 의견').getByRole('button', { name: '내 기준으로 의견 채우기', exact: true })).toBeEnabled();
  const saved = (await room(page)).myCondition!;
  expect(saved.maxBudgetKrw).toBe(20000);
  expect(saved.preferences).toEqual({ requiredTags: ['실내'], preferredTags: ['카페'], avoidTags: ['야외'] });
  expect(saved.availabilityWindows).toEqual([{ startsAt: current.candidates[0].time.startsAt, endsAt: current.candidates[0].time.endsAt }]);
}
async function quickSave(page: Page) {
  const quick = page.getByRole('region', { name: '한 번에 의견 입력', exact: true });
  await quick.getByRole('button', { name: '가능', exact: true }).click();
  await quick.getByRole('button', { name: '편함', exact: true }).click();
  await quick.getByRole('button', { name: '이 선택을 모든 후보에 저장', exact: true }).click();
  await expect(quick.getByText('후보 2개의 의견을 모두 저장했습니다.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await room(page)).myResponses.length).toBe(2);
}
async function setup(world: World) {
  const host = await world.page();
  await host.goto('/');
  await host.getByLabel('모임 제목', { exact: true }).fill(`browser-e2e-${Date.now()}`);
  await host.getByLabel('방장 이름', { exact: true }).fill('E2E host');
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(host).toHaveURL(/\/rooms\/[0-9a-f-]+$/);
  await expect(host.getByRole('heading', { name: '함께하는 사람', exact: true })).toBeVisible();
  const created = await room(host);
  world.track(created.room.id);
  const members: Page[] = [];
  for (const name of ['E2E member one', 'E2E member two']) {
    const member = await world.page();
    await member.goto(`/join/${created.room.roomCode}`);
    await member.getByLabel('이름', { exact: true }).fill(name);
    await member.getByRole('button', { name: '방에 입장하기', exact: true }).click();
    await expect(member).toHaveURL(host.url());
    await expect(member.getByRole('region', { name: '함께하는 사람' })).toContainText(`${name}님으로 참여 중입니다. (참여자)`);
    members.push(member);
  }
  await expect.poll(async () => (await room(host)).participants.length).toBe(3);
  const participants = (await room(host)).participants;
  expect(participants.map((item) => [item.displayName, item.role]).sort()).toEqual([
    ['E2E host', 'HOST'], ['E2E member one', 'MEMBER'], ['E2E member two', 'MEMBER'],
  ]);
  await expect(host.getByRole('region', { name: '함께하는 사람' })).toContainText('E2E host님으로 참여 중입니다. (방장)');
  await addCandidate(host, 'E2E inside', false);
  await addCandidate(host, 'E2E outside', true);
  for (const page of [host, ...members]) {
    await expect(opinion(page, 'E2E outside')).toBeVisible();
    await expect(opinion(page, 'E2E inside').getByRole('button', { name: '보류', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await saveCondition(host);
  for (const member of members) await saveCondition(member);
  return { host, members, roomId: created.room.id };
}
async function calculate(page: Page) {
  await action(page, page.getByRole('button', { name: '추천 결과 만들기', exact: true }), 'POST', /\/calculations$/, 202);
  await expect(result(page, 'E2E inside').getByText(/이 후보에 응답한 사람: 3명\s*\/\s*3명/)).toBeVisible();
  await expect(section(page, '모임 추천 결과 확인').getByText(/6개\s*\/\s*6개/)).toBeVisible();
  const current = await room(page);
  expect(current.room.status).toBe('CALCULATED');
  return current.room.latestScoreResultId!;
}
async function confirm(page: Page, name = 'E2E outside') {
  const select = result(page, name).getByRole('button', { name: '이 후보 선택', exact: true });
  if (await select.count()) await select.click();
  const acknowledge = page.getByRole('checkbox', { name: '선택한 후보의 확인할 점과 추천 근거를 확인했습니다.', exact: true });
  if (await acknowledge.count()) {
    await expect(page.getByRole('button', { name: '이 후보로 일정 확정', exact: true })).toBeDisabled();
    await acknowledge.check();
  }
  await page.getByLabel(/^확정 메모/).fill('E2E 확인할 점을 검토하고 확정');
  await action(page, page.getByRole('button', { name: '이 후보로 일정 확정', exact: true }), 'POST', /\/decision$/, 201);
  await expect(page.getByRole('heading', { name: '방장이 일정을 확정했습니다', exact: true })).toBeVisible();
  expect((await room(page)).room.status).toBe('CONFIRMED');
}

test('생성·참여 → 조건·자동 초안·수동 수정·저장 → 실제 계산·확정 → 재검토·재계산', async ({ world }) => {
  const { host, members } = await setup(world);
  const responsePanel = section(host, '후보별 의견');
  let writes = 0;
  host.on('request', (request) => { if (request.method() === 'PUT' && /\/responses\//.test(request.url())) writes += 1; });
  expect((await room(host)).myResponses.length).toBe(0);
  await responsePanel.getByRole('button', { name: '내 기준으로 의견 채우기', exact: true }).click();
  await expect(opinion(host, 'E2E inside').getByRole('button', { name: '가능', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(opinion(host, 'E2E outside').getByRole('button', { name: '보류', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(opinion(host, 'E2E inside')).toContainText('내 가능 시간에 포함되어 가능으로 채웠습니다.');
  await expect(opinion(host, 'E2E outside')).toContainText('내 가능 시간 밖이어서 보류로 채웠습니다.');
  for (const warning of ['예산 한도', '필수로 고른 특징이 없습니다: 실내', '피하고 싶은 특징이 포함되어 있습니다: 야외']) await expect(opinion(host, 'E2E outside')).toContainText(warning);
  await expect(responsePanel.getByText('자동 초안 · 미제출', { exact: true })).toHaveCount(2);
  expect(writes).toBe(0);
  const unsaved = await room(host);
  expect(unsaved.myResponses.length).toBe(0);
  expect(unsaved.currentParticipant.status).toBe('JOINED');
  await opinion(host, 'E2E outside').getByRole('button', { name: '불가', exact: true }).click();
  await responsePanel.getByRole('button', { name: '내 기준으로 다시 채우기', exact: true }).click();
  await expect(opinion(host, 'E2E outside').getByRole('button', { name: '불가', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(opinion(host, 'E2E outside')).toContainText('피하고 싶은 특징이 포함되어 있습니다: 야외');
  await opinion(host, 'E2E inside').getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(opinion(host, 'E2E inside')).toContainText('이동 부담을 선택해야 합니다.');
  expect(writes).toBe(0);
  for (const name of ['E2E inside', 'E2E outside']) {
    await opinion(host, name).getByRole('button', { name: '편함', exact: true }).click();
    await opinion(host, name).getByLabel(/^메모/).fill(`E2E saved ${name}`);
    await action(host, opinion(host, name).getByRole('button', { name: '변경 저장', exact: true }), 'PUT', /\/responses\//, 200);
    await expect(opinion(host, name).getByText('의견 저장됨', { exact: true })).toBeVisible();
  }
  await host.reload();
  await expect(opinion(host, 'E2E outside').getByLabel(/^메모/)).toHaveValue('E2E saved E2E outside');
  await expect(opinion(host, 'E2E outside').getByRole('button', { name: '불가', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const member of members) await quickSave(member);
  const firstCalculation = await calculate(host);
  await expect(result(host, 'E2E outside')).toContainText('충돌:');
  await expect(result(host, 'E2E inside')).toContainText('점');
  await expect.poll(async () => result(host, 'E2E inside').getByRole('listitem').count()).toBeGreaterThan(0);
  await expect(section(host, '모임 추천 결과 확인')).toContainText('추천에 반영한 내용');
  for (const member of members) {
    await expect(result(member, 'E2E inside')).toBeVisible();
    await expect(member.getByRole('button', { name: '추천 결과 만들기', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '이 후보로 일정 확정', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '이 후보 선택', exact: true })).toHaveCount(0);
  }
  await confirm(host);
  for (const member of members) await expect(member.getByRole('heading', { name: '방장이 일정을 확정했습니다', exact: true })).toBeVisible();
  await host.getByLabel('다시 검토하는 이유', { exact: true }).fill('E2E 장소를 다시 확인');
  await action(host, host.getByRole('button', { name: '확정 내용 다시 검토하기', exact: true }), 'POST', /\/decision\/reopen$/, 200);
  await host.getByText('후보 관리', { exact: true }).click();
  const management = section(host, '모임 후보 관리');
  await management.getByRole('article').filter({ has: host.getByRole('heading', { name: 'E2E inside', exact: true }) }).getByRole('button', { name: '수정', exact: true }).click();
  await management.getByLabel('주소', { exact: true }).fill('서울 중구 테스트길 2');
  await action(host, management.getByRole('button', { name: '수정 내용 저장', exact: true }), 'PATCH', /\/candidates\//, 200);
  await expect(section(host, '모임 추천 결과 확인')).toContainText('이 결과는 최신 내용이 아닙니다.');
  for (const page of [host, ...members]) expect((await room(page)).myResponses.length).toBe(2);
  const nextCalculation = await calculate(host);
  expect(nextCalculation).not.toBe(firstCalculation);
  await confirm(host);
});

async function digest(db: Database, roomId: string) {
  // 비교 데이터에서 자격 증명 원문과 해시를 모두 제외한다.
  const tables = ['rooms', 'participant_conditions', 'participant_responses', 'score_results', 'decisions'];
  const data = [];
  for (const table of tables) {
    const key = table === 'rooms' ? 'id' : 'roomId';
    const rows = await db.query(`SELECT to_jsonb(t) AS data FROM ${table} t WHERE "${key}" = $1 ORDER BY to_jsonb(t)::text`, [roomId]);
    data.push(rows.rows);
  }
  const participants = await db.query('SELECT id, role, status FROM participants WHERE "roomId" = $1 ORDER BY id', [roomId]);
  data.push(participants.rows);
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
async function recoveryCode(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '개인 복구 파일 보관', exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await download.delete();
  const code = Buffer.concat(chunks).toString('utf8').match(/복구 코드: ([^\r\n]+)/)?.[1];
  if (!code) throw new Error('Private recovery file format is invalid.');
  return code;
}
async function reopenTab(page: Page, roomId: string, role: string, participantId: string) {
  const context = page.context();
  const url = page.url();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto('/');
  expect(await fresh.evaluate((id) => sessionStorage.getItem(`meetpoint:room-token:${id}`) === null, roomId)).toBe(true);
  const recovered = fresh.waitForResponse((response) => /\/recovery$/.test(response.url()) && response.request().method() === 'POST');
  await fresh.goto(url);
  expect((await recovered).status()).toBe(201);
  await expect(fresh.getByRole('heading', { name: '함께하는 사람', exact: true })).toBeVisible();
  const current = await room(fresh);
  expect(current.currentParticipant.id).toBe(participantId);
  expect(current.currentParticipant.role).toBe(role);
  expect(current.participants.length).toBe(3);
  return fresh;
}

test('CALCULATED·CONFIRMED에서 HttpOnly 탭 복구·토큰 만료·개인 파일 복구가 기존 데이터와 권한을 유지', async ({ world }) => {
  const { host: originalHost, members, roomId } = await setup(world);
  const code = await recoveryCode(members[1]);
  await quickSave(originalHost);
  for (const member of members) await quickSave(member);
  await calculate(originalHost);
  const hostId = (await room(originalHost)).currentParticipant.id;
  const cookies = await originalHost.context().cookies();
  const recovery = cookies.find((item) => item.name.startsWith('meetpoint_recovery_'));
  expect(Boolean(recovery), 'Recovery cookie issued').toBe(true);
  expect(recovery?.httpOnly).toBe(true);
  expect(recovery?.sameSite).toBe('Strict');
  expect(recovery?.secure).toBe(false); // 개발 HTTP 검증이며 운영 HTTPS는 별도 검증한다.
  expect(await originalHost.evaluate(() => document.cookie.includes('meetpoint_recovery_'))).toBe(false);
  const beforeCalculated = await digest(world.db, roomId);
  const host = await reopenTab(originalHost, roomId, 'HOST', hostId);
  expect(await digest(world.db, roomId)).toBe(beforeCalculated);
  await confirm(host);
  const beforeConfirmed = await digest(world.db, roomId);
  const memberId = (await room(members[0])).currentParticipant.id;
  const recoveredMember = await reopenTab(members[0], roomId, 'MEMBER', memberId);
  expect(await digest(world.db, roomId)).toBe(beforeConfirmed);
  await expect(recoveredMember.getByRole('heading', { name: '방장이 일정을 확정했습니다', exact: true })).toBeVisible();
  await expect(opinion(recoveredMember, 'E2E inside').getByRole('button', { name: '가능', exact: true })).toBeDisabled();
  await world.db.query('UPDATE participants SET "tokenExpiresAt" = NOW() - INTERVAL \'1 minute\' WHERE id = $1 AND "roomId" = $2', [hostId, roomId]);
  const recoveredAfterExpiry = host.waitForResponse((response) => /\/recovery$/.test(response.url()) && response.request().method() === 'POST');
  await host.reload();
  expect((await recoveredAfterExpiry).status()).toBe(201);
  await expect(host.getByRole('heading', { name: '방장이 일정을 확정했습니다', exact: true })).toBeVisible();
  expect((await room(host)).currentParticipant.id).toBe(hostId);
  expect(await digest(world.db, roomId)).toBe(beforeConfirmed);
  const stranger = await world.page();
  expect((await stranger.context().cookies()).length).toBe(0);
  await stranger.goto(host.url());
  await expect(stranger.getByLabel('개인 복구 코드 (초대 방 코드와 다릅니다)', { exact: true })).toBeVisible();
  await expect(stranger.getByText(/일반 방 코드 입장은 기존 역할·조건·응답을 복구하지 않습니다/)).toBeVisible();
  await stranger.getByLabel('개인 복구 코드 (초대 방 코드와 다릅니다)', { exact: true }).fill('invalid-private-recovery-code');
  await action(stranger, stranger.getByRole('button', { name: '기존 참여자로 복구', exact: true }), 'POST', /\/recovery$/, 401);
  await expect(stranger.getByText(/복구하지 못했습니다/)).toBeVisible();
  expect(await digest(world.db, roomId)).toBe(beforeConfirmed);
  const expectedMemberId = (await room(members[1])).currentParticipant.id;
  await members[1].close(); // 복구한 토큰이 기존 탭의 복구 요청으로 다시 무효화되는 것을 막는다.
  await stranger.getByLabel('개인 복구 코드 (초대 방 코드와 다릅니다)', { exact: true }).fill(code);
  await action(stranger, stranger.getByRole('button', { name: '기존 참여자로 복구', exact: true }), 'POST', /\/recovery$/, 201);
  await expect(stranger.getByRole('heading', { name: '방장이 일정을 확정했습니다', exact: true })).toBeVisible();
  const restored = await room(stranger);
  expect(restored.currentParticipant.id).toBe(expectedMemberId);
  expect(restored.currentParticipant.role).toBe('MEMBER');
  expect(restored.myResponses.length).toBe(2);
  expect(restored.participants.length).toBe(3);
  expect(await digest(world.db, roomId)).toBe(beforeConfirmed);
});

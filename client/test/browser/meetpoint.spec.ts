import { test as base, expect, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';
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
  page(options?: BrowserContextOptions): Promise<Page>;
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
        page: async (options) => {
          const context = await browser.newContext({ ...options, baseURL: process.env.MEETPOINT_E2E_URL, timezoneId: 'Asia/Seoul' });
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
  const response = await openResponseDialog(host, 'E2E inside');
  await response.getByRole('button', { name: '갈 수 있어요', exact: true }).click();
  await response.getByRole('button', { name: '편해요', exact: true }).click();
  await openDisclosure(response, /메모 (추가|보기)/);
  await response.getByLabel(/^메모/).fill('429 뒤에도 보존할 초안');
  const save = response.getByRole('button', { name: '이 후보 의견 저장', exact: true });
  await action(host, save, 'PUT', /\/responses\//, 429);
  await expect(response).toContainText(/\d+초 뒤에 다시 시도해 주세요/);
  await expect(response.getByLabel(/^메모/)).toHaveValue('429 뒤에도 보존할 초안');
  expect((await room(host)).myResponses.length).toBe(0);
  expect(mutationRequests).toBe(41);
  expect(recoveryRequests).toBe(0);
  // Wait for normal polling; no automatic mutation retry and both drafts remain.
  await host.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/rooms/${roomId}` && response.status() === 200);
  await expect(response.getByLabel(/^메모/)).toHaveValue('429 뒤에도 보존할 초안');
  await expect(condition.getByLabel('1인 최대 예산 (원)', { exact: true })).toHaveValue('23456');
  expect(mutationRequests).toBe(41);
  await response.getByRole('button', { name: '의견 창 닫기', exact: true }).click();

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
async function openDisclosure(scope: Page | Locator, title: string | RegExp) {
  const summary = scope.locator('summary').filter({ hasText: title });
  if (!(await summary.evaluate(node => node.closest('details')?.open))) await summary.click();
}
function opinion(page: Page, name: string) {
  return section(page, '어디가 괜찮아요?').getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
}
async function openResponseDialog(page: Page, name: string) {
  return openResponseDialogFromCard(opinion(page, name));
}
async function openResponseDialogFromCard(card: Locator) {
  await card.getByRole('button', { name: /^(의견 남기기|의견 확인하기|내 의견 보기)$/ }).click();
  return card.getByRole('dialog');
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
    if (!response.ok) throw new Error(`Public Room verification failed (${response.status}).`);
    return response.json();
  }, process.env.MEETPOINT_E2E_API_URL!);
}
async function action(page: Page, locator: Locator, method: string, endpoint: RegExp, status: number) {
  const response = page.waitForResponse((item) => item.request().method() === method && endpoint.test(new URL(item.url()).pathname));
  await locator.click();
  expect((await response).status(), 'Action response status').toBe(status);
}
async function addCandidate(page: Page, name: string, second: boolean, withDetails = true) {
  const management = section(page, '모임 후보 관리');
  const add = management.getByRole('button', { name: '후보 추가', exact: true });
  if (await add.isVisible()) await add.click();
  await management.getByRole('button', { name: '내일', exact: true }).click();
  await management.getByRole('button', { name: second ? '저녁 18:00~20:00' : '점심 12:00~14:00', exact: true }).click();
  await management.getByLabel('장소명', { exact: true }).fill(name);
  await management.getByLabel('주소', { exact: true }).fill('서울 중구 테스트길 1');
  await management.getByLabel('1인 예상 비용 (원)', { exact: true }).fill(second ? '40000' : '10000');
  if (withDetails) {
    await openDisclosure(management, '지역·장소 특징 (선택)');
    await management.getByLabel('지역', { exact: true }).fill('중구');
    await management.getByLabel('특징', { exact: true }).fill(second ? '야외' : '실내, 카페');
  }
  await action(page, management.getByRole('button', { name: '후보 등록', exact: true }), 'POST', /\/candidates$/, 201);
  await expect(management.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function saveCondition(page: Page) {
  await openDisclosure(page, /^선택 조건 (추가|보기)$/);
  const current = await room(page);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(current.candidates[0].time.startsAt));
  const condition = section(page, '원하는 조건을 알려주세요');
  await condition.getByLabel('날짜', { exact: true }).fill(date);
  await condition.getByLabel('시작', { exact: true }).fill('12:00');
  await condition.getByLabel('종료', { exact: true }).fill('14:00');
  if (!current.myCondition) await expect(condition.getByLabel('예산 제한 없음', { exact: true })).toBeHidden();
  await openDisclosure(condition, '예산·장소 특징 (선택)');
  await condition.getByLabel('예산 제한 없음', { exact: true }).uncheck();
  await condition.getByLabel('1인 최대 예산 (원)', { exact: true }).fill('20000');
  await condition.getByLabel('꼭 필요한 특징', { exact: true }).fill('실내');
  await condition.getByLabel('있으면 좋은 특징', { exact: true }).fill('카페');
  await condition.getByLabel('피하고 싶은 특징', { exact: true }).fill('야외');
  await action(page, condition.getByRole('button', { name: '선택 조건 저장', exact: true }), 'PUT', /\/conditions$/, 200);
  await openDisclosure(section(page, '어디가 괜찮아요?'), '빠른 입력 도구');
  await expect(section(page, '어디가 괜찮아요?').getByRole('button', { name: '내 기준으로 의견 채우기', exact: true })).toBeEnabled();
  const saved = (await room(page)).myCondition!;
  expect(saved.maxBudgetKrw).toBe(20000);
  expect(saved.preferences).toEqual({ requiredTags: ['실내'], preferredTags: ['카페'], avoidTags: ['야외'] });
  expect(saved.availabilityWindows).toEqual([{ startsAt: current.candidates[0].time.startsAt, endsAt: current.candidates[0].time.endsAt }]);
}
async function quickSave(page: Page) {
  await openDisclosure(section(page, '어디가 괜찮아요?'), '빠른 입력 도구');
  const quick = page.getByRole('region', { name: '한 번에 의견 입력', exact: true });
  await quick.getByRole('button', { name: '갈 수 있어요', exact: true }).click();
  await quick.getByRole('button', { name: '편해요', exact: true }).click();
  await quick.getByRole('button', { name: '같은 의견을 모든 후보에 저장', exact: true }).click();
  await expect(section(page, '어디가 괜찮아요?').getByText('후보 2개의 의견을 저장했습니다.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await room(page)).myResponses.length).toBe(2);
}
async function setup(world: World, { hostName = 'E2E host', realRecovery = false } = {}) {
  async function createPage() {
    const page = await world.page();
    // Background registration shares an IP quota across the entire suite.
    if (!realRecovery) {
      await page.route('**/recovery/register', (route) =>
        route.fulfill({ json: { recovery: { code: null } } }));
    }
    return page;
  }
  const host = await createPage();
  await host.goto('/');
  await host.getByRole('button', { name: '약속 방 만들기', exact: true }).click();
  await host.getByLabel('모임 제목', { exact: true }).fill(`browser-e2e-${Date.now()}`);
  await host.getByLabel('방장 이름', { exact: true }).fill(hostName);
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(host).toHaveURL(/\/rooms\/[0-9a-f-]+$/);
  await expect(host.getByRole('heading', { name: '함께하는 사람', exact: true })).toBeVisible();
  const created = await room(host);
  world.track(created.room.id);
  const members: Page[] = [];
  for (const name of ['E2E member one', 'E2E member two']) {
    const member = await createPage();
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
    [hostName, 'HOST'], ['E2E member one', 'MEMBER'], ['E2E member two', 'MEMBER'],
  ].sort());
  await expect(host.getByRole('region', { name: '함께하는 사람' })).toContainText(`${hostName}님으로 참여 중입니다. (방장)`);
  await addCandidate(host, 'E2E inside', false);
  await addCandidate(host, 'E2E outside', true);
  for (const page of [host, ...members]) {
    await expect(opinion(page, 'E2E outside')).toBeVisible();
    await expect(opinion(page, 'E2E inside').locator('button[aria-pressed="true"]')).toHaveCount(0);
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
  const select = result(page, name).getByRole('button', { name: /^(이 후보 선택|선택한 후보)$/ });
  await select.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  const acknowledge = page.getByRole('checkbox', { name: '선택한 후보의 확인할 점과 추천 근거를 확인했습니다.', exact: true });
  if (await acknowledge.count()) {
    await expect(page.getByRole('button', { name: '확정 전 일정 확인', exact: true })).toBeDisabled();
    await acknowledge.check();
  }
  await page.getByLabel(/^확정 메모/).fill('E2E 확인할 점을 검토하고 확정');
  await page.getByRole('button', { name: '확정 전 일정 확인', exact: true }).click();
  const review = page.getByRole('dialog', { name: '이 일정으로 확정할까요?' });
  await expect(review.getByText(name, { exact: true })).toBeVisible();
  await action(page, review.getByRole('button', { name: '일정 확정', exact: true }), 'POST', /\/decision$/, 201);
  await expect(page.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  expect((await room(page)).room.status).toBe('CONFIRMED');
}

test('모바일에서 방장과 참가자가 후보 카드에 의견을 남기고 일정을 확정한다', async ({ world }) => {
  const { host, members } = await setup(world);
  for (const page of [host, ...members]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('navigation', { name: '방 진행 단계' }).getByRole('button', { name: /내 의견/ }).click();
    for (const name of ['E2E inside', 'E2E outside']) {
      const card = opinion(page, name);
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: '갈 수 있어요', exact: true })).toBeHidden();
      await card.getByRole('button', { name: '의견 남기기', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `${name} 의견`, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '갈 수 있어요', exact: true }).click();
      await dialog.getByRole('button', { name: '편해요', exact: true }).click();
      await action(page, dialog.getByRole('button', { name: '이 후보 의견 저장', exact: true }), 'PUT', /\/responses\//, 200);
      await dialog.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
      await expect(card.getByText('의견 저장됨', { exact: true })).toBeVisible();
    }
    expect((await room(page)).myResponses.length).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await host.getByRole('navigation', { name: '방 진행 단계' }).getByRole('button', { name: /결과 확인/ }).click();
  await calculate(host);
  await confirm(host);
  for (const page of [host, ...members]) {
    await page.bringToFront();
    await expect(page.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  }
});

test('모바일 방 첫 화면에서 역할별 다음 행동과 접힌 복구 도구를 제공한다', async ({ world }) => {
  const host = await world.page({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 740 } });
  await host.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await host.goto('/');
  await expect(host.getByRole('heading', { name: /이번엔,\s*어디서 만날까\?/, level: 1 })).toBeVisible();
  await expect(host.getByRole('link', { name: '방 코드로 입장하기' })).toBeInViewport({ ratio: 1 });
  await host.getByRole('button', { name: '약속 방 만들기', exact: true }).click();
  await expect(host.locator('input[required]:visible')).toHaveCount(2);
  const title = host.getByLabel('모임 제목', { exact: true });
  const nextSteps = host.getByText('시간과 장소 후보를 올리고 친구들에게 링크를 보내요.', { exact: false });
  const nextStepsToggle = host.getByText('방을 만든 뒤엔?', { exact: true });
  await expect(nextSteps).toBeHidden();
  await nextStepsToggle.click();
  await expect(nextSteps).toBeVisible();
  await nextStepsToggle.click();
  await expect(nextSteps).toBeHidden();
  const createButton = host.getByRole('button', { name: '방 만들기', exact: true });
  const hostName = host.getByLabel('방장 이름', { exact: true });
  await expect(createButton).toBeInViewport({ ratio: 1 });
  expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await createButton.click();
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await title.fill(`browser-e2e-${Date.now()}`);
  await expect(title).toHaveAttribute('aria-invalid', 'false');
  await hostName.fill('방장');
  await action(host, createButton, 'POST', /\/rooms$/, 201);
  await expect(host).toHaveURL(/\/rooms\/[0-9a-f-]+$/);

  await host.setViewportSize({ width: 390, height: 844 });
  const register = host.getByRole('button', { name: '후보 등록하기', exact: true });
  await expect(register).toBeInViewport({ ratio: 1 });
  const initialRoom = await room(host);
  world.track(initialRoom.room.id);
  await host.getByRole('button', { name: '초대 링크 복사', exact: true }).click();
  await expect(host.getByRole('button', { name: '링크 복사됨', exact: true })).toBeVisible();
  const inviteLink = await host.evaluate(() => navigator.clipboard.readText());
  expect(new URL(inviteLink).pathname === `/join/${initialRoom.room.roomCode}`).toBe(true);
  const recoveryToggle = host.locator('summary').filter({ hasText: '방 접근 및 복구' });
  const recoveryFile = host.getByRole('button', { name: '개인 복구 파일 보관', exact: true });
  await expect(recoveryFile).toBeHidden();
  await recoveryToggle.click();
  await expect(recoveryFile).toBeVisible();
  await recoveryToggle.press('Enter');
  await expect(recoveryFile).toBeHidden();
  await register.click();
  await expect(host.locator('#room-candidates')).toBeFocused();
  await expect(section(host, '모임 후보 관리')).toBeInViewport();

  const member = await world.page({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  await member.goto(inviteLink);
  await expect(member.getByRole('heading', { name: '모임에 참여하기', exact: true, level: 1 })).toBeVisible();
  await expect(member.locator('input[required]:visible')).toHaveCount(1);
  await expect(member.getByLabel('방 코드', { exact: true })).toHaveCount(0);
  await expect(member.getByText('입장하면 방장이 올린 모임 후보에 의견을 남길 수 있어요.', { exact: true })).toBeInViewport({ ratio: 1 });
  const joinButton = member.getByRole('button', { name: '방에 입장하기', exact: true });
  const memberName = member.getByLabel('이름', { exact: true });
  await expect(joinButton).toBeInViewport({ ratio: 1 });
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await joinButton.click();
  await expect(memberName).toBeFocused();
  await expect(memberName).toHaveAttribute('aria-invalid', 'true');
  await memberName.fill('참가자');
  await action(member, joinButton, 'POST', /\/participants$/, 201);
  await expect(member).toHaveURL(host.url());
  await expect(member.getByRole('heading', { name: '방장이 후보를 준비하고 있어요', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(member.getByRole('button', { name: '후보 등록하기', exact: true })).toHaveCount(0);
  await host.bringToFront();
  await expect(host.getByLabel('지역', { exact: true })).toBeHidden();
  await expect(host.getByRole('button', { name: '내일', exact: true })).toBeVisible();
  await addCandidate(host, '첫 번째 후보', false, false);
  expect((await room(host)).candidates[0].place.area).toBe('서울 중구 테스트길 1');
  await expect(host.getByRole('heading', { name: '후보를 하나 더 등록해 주세요', exact: true })).toBeVisible();
  const management = section(host, '모임 후보 관리');
  await expect(management.getByLabel('장소명', { exact: true })).toBeHidden();
  await management.getByRole('button', { name: '다른 시간 추가', exact: true }).click();
  await expect(management.getByLabel('장소명', { exact: true })).toHaveValue('첫 번째 후보');
  await expect(management.getByLabel('주소', { exact: true })).toHaveValue('서울 중구 테스트길 1');
  const directStart = management.getByLabel('시작 시간', { exact: true });
  await expect(directStart).toBeHidden();
  await openDisclosure(management, '직접 시간 입력');
  await expect(directStart).toHaveValue('');
  await directStart.fill('18:30');
  await management.getByLabel('종료 시간', { exact: true }).fill('20:30');
  await management.getByRole('button', { name: '무료', exact: true }).click();
  await expect(management.getByLabel('1인 예상 비용 (원)', { exact: true })).toHaveValue('0');
  await action(host, management.getByRole('button', { name: '후보 등록', exact: true }), 'POST', /\/candidates$/, 201);
  expect((await room(host)).candidates[1].estimatedCostPerPersonKrw).toBe(0);
  await member.bringToFront();
  const steps = member.getByRole('navigation', { name: '방 진행 단계' });
  await steps.getByRole('button', { name: '선택 조건', exact: true }).click();
  const respond = member.getByRole('button', { name: '내 의견 남기기', exact: true });
  await expect(respond).toBeInViewport({ ratio: 1 });
  await respond.click();
  await expect(member.locator('#room-responses')).toBeFocused();
  await expect(member.getByRole('heading', { name: '어디가 괜찮아요?', exact: true })).toBeInViewport();
  const memberOpinions = section(member, '어디가 괜찮아요?');
  const cards = memberOpinions.getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(cards.first().getByLabel('메모 (선택)')).toBeHidden();
  await expect(cards.first().getByRole('button', { name: '편해요', exact: true })).toBeHidden();
  await expect(memberOpinions.getByRole('region', { name: '한 번에 의견 입력' })).toBeHidden();
  const firstResponse = await openResponseDialogFromCard(cards.first());
  await firstResponse.getByRole('button', { name: '갈 수 있어요', exact: true }).click();
  await firstResponse.getByRole('button', { name: '편해요', exact: true }).click();
  await firstResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  const secondResponse = await openResponseDialogFromCard(cards.last());
  await secondResponse.getByRole('button', { name: '아직 몰라요', exact: true }).click();
  await secondResponse.getByRole('button', { name: '부담돼요', exact: true }).click();
  await secondResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  expect((await room(member)).myResponses.length).toBe(0);
  await memberOpinions.getByRole('button', { name: '작성한 의견 한꺼번에 저장 (2개)', exact: true }).click();
  await expect(memberOpinions.getByLabel('내 의견 저장 진행률', { exact: true })).toHaveAttribute('value', '2');
  await expect(member.getByRole('heading', { name: '의견을 모두 남겼어요', exact: true })).toBeVisible();
  const savedStatuses = (await room(member)).myResponses.map(response => response.availabilityStatus);
  expect(savedStatuses.sort()).toEqual(['AVAILABLE', 'MAYBE']);

  await host.bringToFront();
  await host.getByRole('button', { name: '내 의견 남기기', exact: true }).click();
  await expect(host.locator('#room-responses')).toBeFocused();
  await quickSave(host);
  await expect(host.getByRole('heading', { name: '참여자를 더 초대해 주세요', exact: true })).toBeVisible();
  await host.getByRole('button', { name: '참여자 보기', exact: true }).click();
  await expect(host.getByRole('region', { name: '함께하는 사람', exact: true })).toBeInViewport();

  await member.goto(inviteLink);
  const continueLink = member.getByRole('link', { name: '기존 참여 이어가기', exact: true });
  await expect(continueLink).toBeInViewport({ ratio: 1 });
  await expect(member.getByLabel('이름', { exact: true })).toBeHidden();
  const memberId = (await room(host)).participants.find((item) => item.role === 'MEMBER')!.id;
  await continueLink.click();
  await expect(member).toHaveURL(host.url());
  await expect(member.getByRole('heading', { name: '함께하는 사람', exact: true })).toBeVisible();
  expect((await room(member)).currentParticipant.id).toBe(memberId);
  await member.goto(inviteLink);
  await member.getByRole('button', { name: '새 참여자로 입장', exact: true }).click();
  await expect(memberName).toBeFocused();
  await member.getByRole('link', { name: '다른 방 코드 입력', exact: true }).click();
  await expect(member).toHaveURL(/\/join$/);
  await expect(member.locator('input[required]:visible')).toHaveCount(2);
  await member.goto('/join/invalid-link');
  const manualJoin = member.getByRole('region', { name: '방 코드로 참여하기', exact: true });
  await expect(manualJoin.getByRole('alert')).toContainText('방장에게 새 링크를 요청해 주세요');
  await expect(member.getByLabel('방 코드', { exact: true })).toHaveValue('');
});

test('생성·참여 → 조건·자동 초안·수동 수정·저장 → 실제 계산·확정 → 재검토·재계산', async ({ world }) => {
  const { host, members } = await setup(world);
  const responsePanel = section(host, '어디가 괜찮아요?');
  let writes = 0;
  host.on('request', (request) => { if (request.method() === 'PUT' && /\/responses\//.test(request.url())) writes += 1; });
  expect((await room(host)).myResponses.length).toBe(0);
  await responsePanel.getByRole('button', { name: '내 기준으로 의견 채우기', exact: true }).click();
  let insideResponse = await openResponseDialog(host, 'E2E inside');
  await expect(insideResponse.getByRole('button', { name: '갈 수 있어요', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(insideResponse).toContainText('내 가능 시간에 포함되어 가능으로 채웠습니다.');
  await insideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  let outsideResponse = await openResponseDialog(host, 'E2E outside');
  await expect(outsideResponse.getByRole('button', { name: '아직 몰라요', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(outsideResponse).toContainText('내 가능 시간 밖이어서 보류로 채웠습니다.');
  for (const warning of ['예산 한도', '필수로 고른 특징이 없습니다: 실내', '피하고 싶은 특징이 포함되어 있습니다: 야외']) await expect(outsideResponse).toContainText(warning);
  await outsideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  await expect(responsePanel.getByText('자동으로 채움 · 저장 전', { exact: true })).toHaveCount(2);
  expect(writes).toBe(0);
  const unsaved = await room(host);
  expect(unsaved.myResponses.length).toBe(0);
  expect(unsaved.currentParticipant.status).toBe('JOINED');
  outsideResponse = await openResponseDialog(host, 'E2E outside');
  await outsideResponse.getByRole('button', { name: '어려워요', exact: true }).click();
  await outsideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  await responsePanel.getByRole('button', { name: '내 기준으로 다시 채우기', exact: true }).click();
  outsideResponse = await openResponseDialog(host, 'E2E outside');
  await expect(outsideResponse.getByRole('button', { name: '어려워요', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(outsideResponse).toContainText('피하고 싶은 특징이 포함되어 있습니다: 야외');
  await outsideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  insideResponse = await openResponseDialog(host, 'E2E inside');
  await insideResponse.getByRole('button', { name: '이 후보 의견 저장', exact: true }).click();
  await expect(insideResponse).toContainText('이동 부담을 선택해 주세요.');
  await insideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  expect(writes).toBe(0);
  for (const name of ['E2E inside', 'E2E outside']) {
    const response = await openResponseDialog(host, name);
    await response.getByRole('button', { name: '편해요', exact: true }).click();
    await openDisclosure(response, /메모 (추가|보기)/);
    await response.getByLabel(/^메모/).fill(`E2E saved ${name}`);
    await action(host, response.getByRole('button', { name: '이 후보 의견 저장', exact: true }), 'PUT', /\/responses\//, 200);
    await expect(opinion(host, name).getByText('의견 저장됨', { exact: true })).toBeVisible();
    await response.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  }
  await host.reload();
  outsideResponse = await openResponseDialog(host, 'E2E outside');
  await expect(outsideResponse.getByLabel(/^메모/)).toHaveValue('E2E saved E2E outside');
  await expect(outsideResponse.getByRole('button', { name: '어려워요', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await outsideResponse.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  for (const member of members) await quickSave(member);
  const firstCalculation = await calculate(host);
  await expect(result(host, 'E2E outside')).toContainText('충돌:');
  await expect(result(host, 'E2E inside')).toContainText('점');
  await expect.poll(async () => result(host, 'E2E inside').getByRole('listitem').count()).toBeGreaterThan(0);
  await expect(section(host, '모임 추천 결과 확인')).toContainText('추천에 반영한 내용');
  for (const member of members) {
    await expect(result(member, 'E2E inside')).toBeVisible();
    await expect(member.getByRole('button', { name: '추천 결과 만들기', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '확정 전 일정 확인', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '이 후보 선택', exact: true })).toHaveCount(0);
  }
  await confirm(host);
  for (const member of members) await expect(member.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  await host.getByText('추천 근거와 방 관리', { exact: true }).click();
  await host.getByLabel('다시 검토하는 이유', { exact: true }).fill('E2E 장소를 다시 확인');
  await action(host, host.getByRole('button', { name: '확정 내용 다시 검토하기', exact: true }), 'POST', /\/decision\/reopen$/, 200);
  const retainedHistory = await world.db.query('SELECT candidates, ranking, metadata FROM score_results WHERE id = $1', [firstCalculation]);
  const oldCandidate = (await room(host)).candidates.find(candidate => candidate.place.name === 'E2E inside')!;
  const memberDraft = await openResponseDialog(members[0], 'E2E inside');
  await openDisclosure(memberDraft, /메모 (추가|보기)/);
  await memberDraft.getByLabel(/^메모/).fill('후보 변경 중에도 유지할 초안');
  await memberDraft.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  await host.getByText('후보 관리', { exact: true }).click();
  const management = section(host, '모임 후보 관리');
  await management.getByRole('article').filter({ has: host.getByRole('heading', { name: 'E2E inside', exact: true }) }).getByRole('button', { name: '수정', exact: true }).click();
  const editAddress = management.getByLabel('주소', { exact: true });
  await expect(editAddress).toHaveValue(oldCandidate.place.address);
  await editAddress.fill('서울 중구 테스트길 2');
  await action(host, management.getByRole('button', { name: '수정 내용 저장', exact: true }), 'PATCH', /\/candidates\//, 200);
  const updatedCandidate = (await room(host)).candidates.find(candidate => candidate.id === oldCandidate.id)!;
  expect(updatedCandidate.place.address).toBe('서울 중구 테스트길 2');
  await expect(section(host, '모임 추천 결과 확인')).toContainText('이 결과는 최신 내용이 아닙니다.');
  for (const page of [host, ...members]) {
    await page.bringToFront();
    await expect(opinion(page, 'E2E inside')).toContainText('후보가 변경되어 의견 재확인이 필요합니다');
    await expect(opinion(page, 'E2E inside').getByText('의견 저장됨', { exact: true })).toHaveCount(0);
    await expect(opinion(page, 'E2E outside').getByText('의견 저장됨', { exact: true })).toBeVisible();
    const current = await room(page);
    expect(current.myResponses.find(response => response.candidateId === oldCandidate.id)!.status).toBe('RECONFIRM_REQUIRED');
    expect(current.currentParticipant.status).toBe('JOINED');
  }
  const retainedDraft = await openResponseDialog(members[0], 'E2E inside');
  await expect(retainedDraft.getByLabel(/^메모/)).toHaveValue('후보 변경 중에도 유지할 초안');
  await retainedDraft.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  world.allowResourceErrors([409]);
  const staleSaveStatus = await members[0].evaluate(async ({ api, candidateId, version }) => {
    const roomId = window.location.pathname.split('/').pop()!;
    const participantId = sessionStorage.getItem(`meetpoint:room-participant:${roomId}`);
    const response = await fetch(`${api}/api/v1/rooms/${roomId}/participants/${participantId}/responses/${candidateId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(`meetpoint:room-token:${roomId}`)}` },
      body: JSON.stringify({ candidateVersion: version, availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' }),
    });
    return response.status;
  }, { api: process.env.MEETPOINT_E2E_API_URL!, candidateId: oldCandidate.id, version: oldCandidate.version });
  expect(staleSaveStatus).toBe(409);
  await action(host, host.getByRole('button', { name: '추천 결과 만들기', exact: true }), 'POST', /\/calculations$/, 202);
  await expect(result(host, 'E2E inside')).toContainText(/이 후보에 응답한 사람: 0명\s*\/\s*3명/);
  await expect(host.getByRole('button', { name: '확정 전 일정 확인', exact: true })).toBeDisabled();
  for (const page of [host, ...members]) {
    const response = await openResponseDialog(page, 'E2E inside');
    await action(page, response.getByRole('button', { name: '이 후보 의견 저장', exact: true }), 'PUT', /\/responses\//, 200);
    await expect(opinion(page, 'E2E inside').getByText('의견 저장됨', { exact: true })).toBeVisible();
    await response.getByRole('button', { name: '의견 창 닫기', exact: true }).click();
    expect((await room(page)).currentParticipant.status).toBe('RESPONDED');
  }
  const historyAfter = await world.db.query('SELECT candidates, ranking, metadata FROM score_results WHERE id = $1', [firstCalculation]);
  expect(historyAfter.rows).toEqual(retainedHistory.rows);
  const nextCalculation = await calculate(host);
  expect(nextCalculation).not.toBe(firstCalculation);
  await confirm(host);
});

test('모바일 결과 근거·키보드 펼침·후보 선택·polling 초안 유지·문제 확인 후 HOST 확정', async ({ world }) => {
  const hostName = '긴이름을사용하는참가자의추천근거확인';
  const { host, members } = await setup(world, { hostName });
  // 기존 API로 높은 평균과 예산 충돌을 함께 만드는 소유 fixture.
  const initial = await room(host);
  const candidate = initial.candidates.find((item) => item.place.name === 'E2E inside')!;
  const patchStatus = await host.evaluate(async ({ api, roomId, candidateId, version }) => {
    const response = await fetch(`${api}/api/v1/rooms/${roomId}/candidates/${candidateId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match-Version': String(version), Authorization: `Bearer ${sessionStorage.getItem(`meetpoint:room-token:${roomId}`)}` },
      body: JSON.stringify({ estimatedCostPerPersonKrw: 21000 }),
    });
    return response.status;
  }, { api: process.env.MEETPOINT_E2E_API_URL!, roomId: initial.room.id, candidateId: candidate.id, version: candidate.version });
  expect(patchStatus).toBe(200);
  await host.reload();
  for (const page of [host, ...members]) {
    await expect(opinion(page, 'E2E inside')).toContainText('21,000원');
    await quickSave(page);
  }
  await host.setViewportSize({ width: 320, height: 740 });
  const steps = host.getByRole('navigation', { name: '방 진행 단계' });
  await steps.getByRole('button', { name: /결과 확인/ }).click();
  await calculate(host);
  const inside = result(host, 'E2E inside');
  await expect(inside).toContainText('99.0점');
  await expect(inside).toContainText('21,000원');
  await expect(inside).toContainText('Asia/Seoul');
  await expect(inside).toContainText('평균 점수가 높아도');
  const conflict = inside.getByRole('listitem').filter({ hasText: '충돌: 예산을 넘어요' });
  await expect(conflict).toHaveCount(1);
  for (const name of [hostName, 'E2E member one', 'E2E member two']) await expect(conflict).toContainText(name);
  const disclosure = inside.locator('details').filter({ has: host.locator('summary').filter({ hasText: hostName }) });
  const summary = disclosure.locator('summary');
  await summary.focus();
  await host.keyboard.press('Space');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure).toContainText('19.0 / 20점');
  await expect(disclosure).toContainText('예산:');
  await result(host, 'E2E outside').getByRole('button', { name: '이 후보 선택', exact: true }).click();
  await expect(disclosure).toHaveAttribute('open', '');
  await inside.getByRole('button', { name: '이 후보 선택', exact: true }).click();
  const confirmButton = host.getByRole('button', { name: '확정 전 일정 확인', exact: true });
  await expect(confirmButton).toBeDisabled();
  const acknowledge = host.getByRole('checkbox', { name: '선택한 후보의 확인할 점과 추천 근거를 확인했습니다.', exact: true });
  await acknowledge.check();
  await expect(confirmButton).toBeDisabled();
  await host.getByLabel(/^확정 메모/).fill('높은 평균과 각 참가자의 예산 충돌을 확인했습니다.');
  // 같은 후보 재선택, polling, 모바일 단계 왕복은 현재 초안·펼침을 유지한다.
  await inside.getByRole('button', { name: '선택한 후보', exact: true }).click();
  const poll = host.waitForResponse((response) => response.request().method() === 'GET' && /\/rooms\/[0-9a-f-]+$/.test(new URL(response.url()).pathname) && response.status() === 200);
  await poll;
  await steps.getByRole('button', { name: /내 의견/ }).click();
  await expect(inside).toBeHidden();
  await steps.getByRole('button', { name: /결과 확인/ }).click();
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(acknowledge).toBeChecked();
  await expect(host.getByLabel(/^확정 메모/)).toHaveValue('높은 평균과 각 참가자의 예산 충돌을 확인했습니다.');
  expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const member = members[0];
  await member.setViewportSize({ width: 390, height: 844 });
  await member.getByRole('navigation', { name: '방 진행 단계' }).getByRole('button', { name: /결과 확인/ }).click();
  await expect(result(member, 'E2E inside')).toBeVisible();
  await result(member, 'E2E inside').locator('summary').first().click();
  await expect(result(member, 'E2E inside').getByText('19.0 / 20점', { exact: true }).first()).toBeVisible();
  for (const name of ['추천 결과 만들기', '이 후보 선택', '확정 전 일정 확인', '일정 확정']) await expect(member.getByRole('button', { name, exact: true })).toHaveCount(0);

  const chosen = (await room(host)).candidates.find((item) => item.place.name === 'E2E inside')!;
  let confirmationRequests = 0;
  host.on('request', (request) => {
    if (request.method() === 'POST' && /\/decision$/.test(new URL(request.url()).pathname)) confirmationRequests++;
  });
  const review = host.getByRole('dialog', { name: '이 일정으로 확정할까요?' });
  await confirmButton.click();
  await expect(review).toBeInViewport({ ratio: 1 });
  await expect(review.getByRole('button', { name: '돌아가기', exact: true })).toBeFocused();
  await expect(review.getByText(chosen.place.name, { exact: true })).toBeVisible();
  await expect(review).toContainText(chosen.place.address!);
  await expect(review.locator('time').nth(0)).toHaveAttribute('datetime', chosen.time.startsAt);
  await expect(review.locator('time').nth(1)).toHaveAttribute('datetime', chosen.time.endsAt);
  expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await host.keyboard.press('Escape');
  await expect(review).toBeHidden();
  await expect(confirmButton).toBeFocused();
  await confirmButton.click();
  await review.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(review).toBeHidden();
  expect(confirmationRequests).toBe(0);
  expect((await room(host)).room.status).toBe('CALCULATED');
  await expect(acknowledge).toBeChecked();
  await expect(host.getByLabel(/^확정 메모/)).toHaveValue('높은 평균과 각 참가자의 예산 충돌을 확인했습니다.');

  await confirmButton.click();
  await action(host, review.getByRole('button', { name: '일정 확정', exact: true }), 'POST', /\/decision$/, 201);
  expect(confirmationRequests).toBe(1);
  await expect(review).toBeHidden();
  await expect(host.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeFocused();
  await expect(host.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeInViewport();
  await expect(host.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  await member.bringToFront();
  await expect(member.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  expect((await room(host)).room.status).toBe('CONFIRMED');
  for (const page of [host, member]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.reload();
    const schedule = page.getByRole('region', { name: '일정이 확정됐어요', exact: true });
    await expect(schedule).toBeInViewport({ ratio: 1 });
    await expect(schedule.getByText('E2E inside', { exact: true })).toBeVisible();
    await expect(schedule).toContainText('서울 중구 테스트길 1');
    await expect(schedule.locator('time').nth(0)).toHaveAttribute('datetime', chosen.time.startsAt);
    await expect(schedule.locator('time').nth(1)).toHaveAttribute('datetime', chosen.time.endsAt);
    await expect(page.getByRole('navigation', { name: '방 진행 단계' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByText('추천 근거와 방 관리', { exact: true }).click();
    await expect(page.getByRole('heading', { name: '확정 근거와 메모', exact: true })).toBeVisible();
    const reopen = page.getByRole('button', { name: '확정 내용 다시 검토하기', exact: true });
    if (page === host) await expect(reopen).toBeVisible();
    else await expect(reopen).toHaveCount(0);
  }
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
  await page.locator('summary').filter({ hasText: '방 접근 및 복구' }).click();
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
  await expect(fresh.getByRole('heading', { name: '함께하는 사람', exact: true })
    .or(fresh.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).filter({ visible: true })).toBeVisible();
  const current = await room(fresh);
  expect(current.currentParticipant.id).toBe(participantId);
  expect(current.currentParticipant.role).toBe(role);
  expect(current.participants.length).toBe(3);
  return fresh;
}

test('CALCULATED·CONFIRMED에서 HttpOnly 탭 복구·토큰 만료·개인 파일 복구가 기존 데이터와 권한을 유지', async ({ world }) => {
  const { host: originalHost, members, roomId } = await setup(world, { realRecovery: true });
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
  await expect(recoveredMember.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  await recoveredMember.getByText('추천 근거와 방 관리', { exact: true }).click();
  const recoveredResponse = await openResponseDialog(recoveredMember, 'E2E inside');
  await expect(recoveredResponse.getByRole('button', { name: '갈 수 있어요', exact: true })).toBeDisabled();
  await world.db.query('UPDATE participants SET "tokenExpiresAt" = NOW() - INTERVAL \'1 minute\' WHERE id = $1 AND "roomId" = $2', [hostId, roomId]);
  const recoveredAfterExpiry = host.waitForResponse((response) => /\/recovery$/.test(response.url()) && response.request().method() === 'POST');
  await host.reload();
  expect((await recoveredAfterExpiry).status()).toBe(201);
  await expect(host.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
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
  await expect(stranger.getByRole('heading', { name: '일정이 확정됐어요', exact: true })).toBeVisible();
  const restored = await room(stranger);
  expect(restored.currentParticipant.id).toBe(expectedMemberId);
  expect(restored.currentParticipant.role).toBe('MEMBER');
  expect(restored.myResponses.length).toBe(2);
  expect(restored.participants.length).toBe(3);
  expect(await digest(world.db, roomId)).toBe(beforeConfirmed);
});

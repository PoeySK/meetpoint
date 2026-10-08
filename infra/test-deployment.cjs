// Own project/DB/ports/images only; never load an existing .env or print credentials.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');

const id = randomBytes(8).toString('hex');
const project = `meetpoint-deploy-test-${id}`;
const tag = `test-${id}`;
const root = path.resolve(__dirname, '..');
let directory;
let started = false;
let base;
let stage = 'setup';
const origin = 'https://meet.example.com';

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function docker(args) {
  const child = spawn('docker', args, { cwd: root, windowsHide: true, stdio: 'ignore' });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) {
    console.error(`Docker ${args.includes('migration:run') ? 'migration' : args.includes('run') ? 'run' : args.includes('up') ? 'up' : args.includes('build') ? 'build' : 'operation'} failed (${code}); raw logs suppressed.`);
    throw new Error('Docker command failed');
  }
}

async function request(route, status, token, body, method = body ? 'POST' : 'GET') {
  stage = `${method} ${route}`;
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, `${method} ${route} status`);
  return { body: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function main() {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meetpoint-deploy-test-'));
  const serverPort = await freePort();
  let clientPort = await freePort();
  while (clientPort === serverPort) clientPort = await freePort();
  const envFile = path.join(directory, 'deployment.env');
  await fs.writeFile(envFile, [
    `POSTGRES_DB=meetpoint_deploy_test_${id}`, 'POSTGRES_USER=meetpoint_test',
    `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
    `CLIENT_ORIGIN=${origin}`, 'NEXT_PUBLIC_API_BASE_URL=https://api.meet.example.com',
    `SERVER_BIND_PORT=${serverPort}`, `CLIENT_BIND_PORT=${clientPort}`, `RELEASE_TAG=${tag}`,
  ].join('\n'), { mode: 0o600 });
  const prefix = ['compose', '--env-file', envFile, '-f', 'infra/docker-compose.deploy.yml', '-p', project];
  const dc = (...args) => docker([...prefix, ...args]);
  try {
    console.log(`Owned deployment project: ${project}`);
    await dc('config', '--quiet');
    console.log('Build deployment images');
    await dc('build', 'client', 'server', 'solver');
    started = true;
    await dc('up', '-d', '--wait', '--wait-timeout', '60', 'postgres');
    console.log('Explicit compiled migration');
    await dc('run', '--rm', 'migrate');
    console.log('Migration passed; starting services');
    await dc('up', '-d', '--wait', '--wait-timeout', '90', 'solver', 'server', 'client');
    base = `http://127.0.0.1:${serverPort}`;
    assert.equal((await request('/live', 200)).body.status, 'ok');
    assert.equal((await request('/ready', 200)).body.status, 'ready');
    stage = 'Client HTTP';
    const homepage = await fetch(`http://127.0.0.1:${clientPort}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(homepage.status, 200);
    const created = await request('/api/v1/rooms', 201, null, {
      title: `deployment-test-${id}`, timezone: 'Asia/Seoul', host: { displayName: 'Test host' },
    });
    assert.match(created.cookie, /HttpOnly/i);
    assert.match(created.cookie, /Secure/i);
    assert.match(created.cookie, /SameSite=Strict/i);
    const room = created.body.room;
    console.log('Health, Client HTTP and room creation passed');
    const hostToken = created.body.access.hostToken;
    const joined = (await request(`/api/v1/rooms/${room.roomCode}/participants`, 201, null, { displayName: 'Test member' })).body;
    const joinedSecond = (await request(`/api/v1/rooms/${room.roomCode}/participants`, 201, null, { displayName: 'Test member two' })).body;
    const candidate = (await request(`/api/v1/rooms/${room.id}/candidates`, 201, hostToken, {
      displayOrder: 1,
      time: { startsAt: '2026-12-01T10:00:00.000Z', endsAt: '2026-12-01T12:00:00.000Z', timezone: 'Asia/Seoul' },
      place: { name: 'Test place', address: 'Seoul', area: 'Seoul' },
      estimatedCostPerPersonKrw: 15000, tags: ['QUIET'],
    })).body.candidate;
    const secondCandidate = (await request(`/api/v1/rooms/${room.id}/candidates`, 201, hostToken, {
      displayOrder: 2,
      time: { startsAt: '2026-12-01T14:00:00.000Z', endsAt: '2026-12-01T16:00:00.000Z', timezone: 'Asia/Seoul' },
      place: { name: 'Test place two', address: 'Seoul', area: 'Seoul' },
      estimatedCostPerPersonKrw: 15000, tags: ['QUIET'],
    })).body.candidate;
    for (const [participant, token] of [
      [created.body.hostParticipant, hostToken], [joined.participant, joined.access.participantToken],
      [joinedSecond.participant, joinedSecond.access.participantToken],
    ]) {
      await request(`/api/v1/rooms/${room.id}/participants/${participant.id}/conditions`, 200, token, {
        availabilityWindows: [{ startsAt: '2026-12-01T09:00:00.000Z', endsAt: '2026-12-01T18:00:00.000Z' }],
        maxBudgetKrw: null, preferences: { requiredTags: [], preferredTags: [], avoidTags: [] },
      }, 'PUT');
      for (const activeCandidate of [candidate, secondCandidate]) {
        await request(`/api/v1/rooms/${room.id}/participants/${participant.id}/responses/${activeCandidate.id}`, 200, token,
          { availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' }, 'PUT');
      }
    }
    const calculation = (await request(`/api/v1/rooms/${room.id}/calculations`, 202, hostToken, { clientRequestId: id })).body.calculation;
    let result;
    for (let attempt = 0; attempt < 60; attempt++) {
      result = (await request(`/api/v1/rooms/${room.id}/calculations/${calculation.id}`, 200, hostToken)).body.calculation;
      if (!['REQUESTED', 'RUNNING'].includes(result.status)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(result.status, 'COMPLETED');
    console.log('Join, conditions, responses and calculation passed');
    await request(`/api/v1/rooms/${room.id}/decision`, 201, hostToken, {
      candidateId: candidate.id, scoreResultId: calculation.id, acknowledgeIssues: false,
    });
    const recovered = (await request(`/api/v1/rooms/${room.id}/recovery`, 201, null,
      { recoveryCode: created.body.recovery.code })).body;
    assert.equal(recovered.participant.id, created.body.hostParticipant.id);
    await request(`/api/v1/rooms/${room.id}`, 401, hostToken);
    const restored = (await request(`/api/v1/rooms/${room.id}`, 200, recovered.access.participantToken)).body;
    assert.equal(restored.room.status, 'CONFIRMED');
    stage = 'backup/restore into a new owned database';
    const restoreDb = `meetpoint_deploy_restore_${id}`;
    await dc('exec', '-T', 'postgres', 'sh', '-c',
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/deployment-test.dump');
    await dc('exec', '-T', 'postgres', 'createdb', '-U', 'meetpoint_test', restoreDb);
    await dc('exec', '-T', 'postgres', 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
      '-U', 'meetpoint_test', '-d', restoreDb, '/tmp/deployment-test.dump');
    await dc('exec', '-T', 'postgres', 'sh', '-c',
      `test "$(psql -U meetpoint_test -d ${restoreDb} -At -c 'SELECT count(*) FROM rooms')" = 1`);
    await dc('exec', '-T', 'postgres', 'rm', '/tmp/deployment-test.dump');
    console.log('PASS: PostgreSQL custom dump and restore into a separate owned DB');
    for (let attempt = 0; attempt < 9; attempt++) await request('/api/v1/rooms', 400, null, {});
    const rateLimited = await request('/api/v1/rooms', 429, null, {
      title: 'Blocked deployment room', timezone: 'Asia/Seoul', host: { displayName: 'Blocked host' },
    });
    assert.equal(rateLimited.body.error.code, 'RATE_LIMITED');
    assert.ok(rateLimited.body.error.details.retryAfterSeconds > 0);
    await request(`/api/v1/rooms/${room.id}`, 200, recovered.access.participantToken);
    console.log('PASS: production rate limit and unaffected Room polling');
    console.log('PASS: deployment health, Client HTTP, create/join/conditions/responses/calculation/decision/recovery and production cookie attributes');
    console.log('HTTPS browser cookie transport still requires the chosen proxy/domain.');
  } finally {
    if (started) await dc('down', '--volumes', '--remove-orphans');
    for (const service of ['client', 'server', 'solver']) {
      await docker(['image', 'rm', `meetpoint-${service}:${tag}`]).catch(() => {});
    }
    await fs.rm(directory, { recursive: true, force: true });
    console.log('Owned deployment resources cleaned.');
  }
}

main().catch(error => {
  console.error(`Deployment verification failed at ${stage}; sensitive payloads/logs suppressed.`);
  if (typeof error.actual === 'number') console.error(`Actual HTTP status: ${error.actual}`);
  process.exitCode = 1;
});

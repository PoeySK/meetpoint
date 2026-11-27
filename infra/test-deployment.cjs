// Own project/DB/ports/images only; never load an existing .env or print credentials.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const assert = require('node:assert/strict');

const id = randomBytes(8).toString('hex');
const project = `meetpoint-deploy-test-${id}`;
const tag = `test-${id}`;
const root = path.resolve(__dirname, '..');
let base;
let stage = 'setup';
const origin = 'https://meet.example.com';
const oracle = process.argv.includes('--oracle');

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

async function docker(args, { env, capture = false } = {}) {
  const child = spawn('docker', args, {
    cwd: root, env, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'ignore',
  });
  const stdout = [];
  if (capture) child.stdout.on('data', (chunk) => stdout.push(chunk));
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) {
    console.error(`Docker ${args.includes('migration:run') ? 'migration' : args.includes('run') ? 'run' : args.includes('up') ? 'up' : args.includes('build') ? 'build' : 'operation'} failed (${code}); raw logs suppressed.`);
    throw new Error('Docker command failed');
  }
  return Buffer.concat(stdout).toString();
}

function requestThroughOracle(port, route, options, clientIp) {
  const agent = new http.Agent();
  agent.createConnection = (connectionOptions) => {
    const socket = net.createConnection(connectionOptions);
    // Funnel sends a PROXY v2 header before the plaintext HTTP request.
    const header = Buffer.from('0d0a0d0a000d0a515549540a2111000c000000007f000001c0010050', 'hex');
    Buffer.from(clientIp.split('.').map(Number)).copy(header, 16);
    socket.write(header);
    return socket;
  };
  return new Promise((resolve, reject) => {
    const request = http.request({ ...options, agent, host: '127.0.0.1', port, path: route }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(new Response(chunks.length ? Buffer.concat(chunks) : null, {
        status: response.statusCode,
        headers: Object.entries(response.headersDistinct).flatMap(([name, values]) =>
          values.map((value) => [name, value])),
      })));
    });
    request.on('error', reject);
    request.end(options.body);
  }).finally(() => agent.destroy());
}

async function request(route, status, token, body, method = body ? 'POST' : 'GET', extras = {}) {
  stage = `${method} ${route}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extras.headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  };
  const response = oracle
    ? await requestThroughOracle(Number(new URL(base).port), route, options, extras.clientIp ?? '192.0.2.1')
    : await fetch(`${base}${route}`, options);
  assert.equal(response.status, status, `${method} ${route} status`);
  return { body: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
}

async function verifyCandidateVersions(roomId, hostToken) {
  const candidates = `/api/v1/rooms/${roomId}/candidates`;
  const original = (await request(candidates, 201, hostToken, {
    displayOrder: 3,
    time: { startsAt: '2026-12-01T18:00:00.000Z', endsAt: '2026-12-01T20:00:00.000Z', timezone: 'Asia/Seoul' },
    place: { name: 'Version test place', address: 'Seoul', area: 'Seoul' },
    estimatedCostPerPersonKrw: 10000, tags: ['QUIET'],
  })).body.candidate;
  const route = `${candidates}/${original.id}`;
  const initialVersion = { headers: { 'If-Match-Version': String(original.version) } };
  const updated = (await request(route, 200, hostToken, { estimatedCostPerPersonKrw: 12000 }, 'PATCH', initialVersion)).body.candidate;
  assert.equal(updated.version, original.version + 1);
  assert.equal(updated.estimatedCostPerPersonKrw, 12000);

  const staleUpdate = await request(route, 409, hostToken, { estimatedCostPerPersonKrw: 15000 }, 'PATCH', initialVersion);
  assert.equal(staleUpdate.body.error.code, 'CANDIDATE_VERSION_CONFLICT');
  const staleArchive = await request(route, 409, hostToken, undefined, 'DELETE', initialVersion);
  assert.equal(staleArchive.body.error.code, 'CANDIDATE_VERSION_CONFLICT');

  const archived = (await request(route, 200, hostToken, undefined, 'DELETE', {
    headers: { 'If-Match-Version': String(updated.version) },
  })).body.candidate;
  assert.equal(archived.status, 'ARCHIVED');
  assert.equal(archived.version, updated.version + 1);
  assert.equal(archived.estimatedCostPerPersonKrw, updated.estimatedCostPerPersonKrw);
  console.log('PASS: candidate PATCH and DELETE return 200 for current versions and 409 for stale versions');
}

async function main() {
  const serverPort = await freePort();
  let clientPort = await freePort();
  while (clientPort === serverPort) clientPort = await freePort();
  const deployment = {
    COMPOSE_DISABLE_ENV_FILE: '1',
    POSTGRES_DB: `meetpoint_deploy_test_${id}`,
    POSTGRES_USER: 'meetpoint_test',
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    CLIENT_ORIGIN: origin,
    NEXT_PUBLIC_API_BASE_URL: oracle ? '/' : 'https://api.meet.example.com',
    API_PROXY_SHARED_SECRET: oracle ? randomBytes(32).toString('hex') : '',
    TRUSTED_PROXY_IPS: '',
    SERVER_BIND_PORT: String(serverPort),
    CLIENT_BIND_PORT: String(clientPort),
    RELEASE_TAG: tag,
  };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
    const name = key.toUpperCase();
    return !name.startsWith('COMPOSE_') && !Object.hasOwn(deployment, name);
  }));
  Object.assign(env, deployment);
  const prefix = ['compose', '-f', 'infra/docker-compose.deploy.yml',
    ...(oracle ? ['-f', 'infra/docker-compose.oracle.yml'] : []), '-p', project];
  const dc = (...args) => docker([...prefix, ...args], { env });
  let started = false;
  try {
    console.log(`Owned deployment project: ${project}`);
    stage = 'Compose test resource isolation';
    const config = JSON.parse(await docker([...prefix, 'config', '--format', 'json'], { env, capture: true }));
    for (const service of ['client', 'server', 'solver']) {
      assert.equal(config.services[service].image, `meetpoint-${service}:${tag}`);
    }
    assert.equal(config.services.postgres.environment.POSTGRES_DB, deployment.POSTGRES_DB);
    if (oracle) {
      stage = 'Oracle port isolation';
      const publishedPorts = Object.entries(config.services).flatMap(([name, service]) =>
        (service.ports ?? []).map((port) => [name, port.host_ip, Number(port.published), port.target]));
      assert.deepEqual(publishedPorts, [['ingress', '127.0.0.1', clientPort, 8080]]);
    }
    stage = 'build deployment images';
    console.log('Build deployment images');
    await dc('build', 'client', 'server', 'solver');
    started = true;
    await dc('up', '-d', '--wait', '--wait-timeout', '60', 'postgres');
    console.log('Explicit compiled migration');
    await dc('run', '--rm', 'migrate');
    console.log('Migration passed; starting services');
    await dc('up', '-d', '--wait', '--wait-timeout', '90', 'solver', 'server', 'client', ...(oracle ? ['ingress'] : []));
    base = `http://127.0.0.1:${oracle ? clientPort : serverPort}`;
    if (oracle) {
      stage = 'Oracle guard from inside the Docker network';
      await dc('exec', '-T', 'client', 'node', '-e',
        'fetch("http://server:3001/api/v1/rooms").then(r=>{if(r.status!==403)process.exit(1)}).catch(()=>process.exit(1))');
    } else {
      assert.equal((await request('/live', 200)).body.status, 'ok');
      assert.equal((await request('/ready', 200)).body.status, 'ready');
    }
    stage = 'Client HTTP';
    const homepage = oracle
      ? await requestThroughOracle(clientPort, '/', { signal: AbortSignal.timeout(5000) }, '192.0.2.1')
      : await fetch(`http://127.0.0.1:${clientPort}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(homepage.status, 200);
    const created = await request('/api/v1/rooms', 201, null, {
      title: `deployment-test-${id}`, timezone: 'Asia/Seoul', host: { displayName: 'Test host' },
    });
    assert.match(created.cookie, /HttpOnly/i);
    assert.match(created.cookie, /Secure/i);
    assert.match(created.cookie, /SameSite=Strict/i);
    if (oracle) assert.equal(created.headers.get('cache-control'), 'no-store');
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
    await verifyCandidateVersions(room.id, hostToken);
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
          { candidateVersion: activeCandidate.version, availabilityStatus: 'AVAILABLE', travelBurden: 'EASY' }, 'PUT');
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
      oracle ? {} : { recoveryCode: created.body.recovery.code }, 'POST',
      oracle ? { headers: { Cookie: created.cookie.split(';', 1)[0] } } : {})).body;
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
    for (let attempt = 0; attempt < 9; attempt++) {
      await request('/api/v1/rooms', 400, null, {}, 'POST', oracle ? {
        headers: { 'X-MeetPoint-Client-Ip': `198.51.100.${attempt + 1}`, 'X-Forwarded-For': `203.0.113.${attempt + 1}` },
      } : {});
    }
    const rateLimited = await request('/api/v1/rooms', 429, null, {
      title: 'Blocked deployment room', timezone: 'Asia/Seoul', host: { displayName: 'Blocked host' },
    }, 'POST', oracle ? { headers: { 'X-MeetPoint-Client-Ip': '192.0.2.2' } } : {});
    assert.equal(rateLimited.body.error.code, 'RATE_LIMITED');
    assert.ok(rateLimited.body.error.details.retryAfterSeconds > 0);
    if (oracle) {
      assert.ok(Number(rateLimited.headers.get('retry-after')) > 0);
      await request('/api/v1/rooms', 400, null, {}, 'POST', { clientIp: '192.0.2.2' });
      console.log('PASS: Oracle ingress preserves distinct client quotas and ignores forged HTTP headers');
    }
    await request(`/api/v1/rooms/${room.id}`, 200, recovered.access.participantToken);
    console.log('PASS: production rate limit and unaffected Room polling');
    console.log('PASS: deployment health, Client HTTP, create/join/conditions/responses/calculation/decision/recovery and production cookie attributes');
    console.log('HTTPS browser cookie transport still requires the chosen proxy/domain.');
  } finally {
    try {
      if (started) await dc('down', '--volumes', '--remove-orphans');
    } finally {
      for (const service of ['client', 'server', 'solver']) {
        await docker(['image', 'rm', `meetpoint-${service}:${tag}`], { env }).catch(() => {});
      }
    }
    console.log('Owned deployment resources cleaned.');
  }
}

main().catch(error => {
  console.error(`Deployment verification failed at ${stage}; sensitive payloads/logs suppressed.`);
  if (typeof error.actual === 'number') console.error(`Actual HTTP status: ${error.actual}`);
  process.exitCode = 1;
});

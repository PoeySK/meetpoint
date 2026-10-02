/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createRequire } = require('node:module');

const client = path.resolve(__dirname, '..');
const root = path.resolve(client, '..');
const server = path.join(root, 'services/server');
const solver = path.join(root, 'services/solver');
const serverRequire = createRequire(path.join(server, 'package.json'));
const { Client } = serverRequire('pg');
const id = randomBytes(8).toString('hex');
const project = `meetpoint-browser-test-${id}`;
const database = `meetpoint_browser_test_${id}`;
const children = new Set();
const composeFile = path.join(root, 'infra/docker-compose.test.yml');
let directory, admin, databaseCreated = false, composeStarted = false;
let cleaning;

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function launch(command, args, cwd, env, visible = false) {
  const child = spawn(command, args, {
    cwd, env, windowsHide: true, detached: process.platform !== 'win32',
    stdio: visible ? 'inherit' : 'ignore',
  });
  children.add(child);
  child.once('error', () => {});
  child.once('exit', () => children.delete(child));
  return child;
}

async function run(label, command, args, cwd, env, visible = false) {
  console.log(label);
  const child = launch(command, args, cwd, env, visible);
  const status = await new Promise((resolve) => {
    child.once('error', () => resolve(-1));
    child.once('exit', (code) => resolve(code));
  });
  if (status !== 0) throw new Error(`${label} failed (exit ${status}); raw service logs suppressed.`);
}

async function ready(label, check, child, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${label} exited before readiness.`);
    try { if (await check()) { console.log(`${label} ready.`); return; } } catch { /* 기동 중 연결 실패는 재시도한다. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} readiness timed out.`);
}

async function stop(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* 이미 종료된 프로세스는 무시한다. */ }
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 이미 종료된 프로세스는 무시한다. */ } resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

function cleanup(env) {
  return cleaning ??= (async () => {
    await Promise.all([...children].map(stop));
    let failed = false;
    if (databaseCreated) {
      if (!/^meetpoint_browser_test_[a-f0-9]{16}$/.test(database)) throw new Error('Unsafe DB cleanup target.');
      try { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); } catch { failed = true; }
    }
    try { await admin?.end(); } catch { failed = true; }
    if (composeStarted) {
      const result = spawnSync('docker', ['compose', '-f', composeFile, '-p', project, 'down', '--volumes', '--remove-orphans'], { env, windowsHide: true, stdio: 'ignore', timeout: 30_000 });
      if (result.status !== 0) failed = true;
    }
    if (directory) {
      const resolved = path.resolve(directory);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith(`meetpoint-browser-${id}-`)) throw new Error('Unsafe temp cleanup target.');
      try { await fs.rm(resolved, { recursive: true, force: true }); } catch { failed = true; }
    }
    if (failed) throw new Error('Owned test cleanup failed.');
    console.log('Owned test processes, DB, Compose project and temporary Client build removed.');
  })();
}

async function main() {
  const dbPort = await freePort();
  const serverPort = await freePort();
  const solverPort = await freePort();
  const clientPort = await freePort();
  const url = `http://localhost:${clientPort}`;
  const api = `http://localhost:${serverPort}`;
  const dbUrl = `postgresql://meetpoint_test:test-only-password@localhost:${dbPort}/${database}`;
  const env = {
    ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: dbUrl, SERVER_PORT: String(serverPort), PORT: String(serverPort),
    CLIENT_ORIGIN: url, SOLVER_PORT: String(solverPort), SOLVER_BASE_URL: `http://localhost:${solverPort}`,
    SOLVER_RESPONSE_TIMEOUT_MS: '10000', CALCULATION_JOB_POLL_INTERVAL_MS: '100',
    CALCULATION_JOB_LEASE_MS: '30000', CALCULATION_JOB_RETRY_DELAY_MS: '100', CALCULATION_JOB_MAX_ATTEMPTS: '3',
    NEXT_PUBLIC_API_BASE_URL: api, NEXT_PUBLIC_SERVER_BASE_URL: api,
    MEETPOINT_TEST_DB_PORT: String(dbPort), MEETPOINT_E2E_URL: url,
    MEETPOINT_E2E_DATABASE_URL: dbUrl, MEETPOINT_E2E_API_URL: api,
  };
  let interrupted = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    interrupted = true;
    void cleanup(env).finally(() => process.exit(1));
  });
  const deadline = setTimeout(() => { interrupted = true; void cleanup(env).finally(() => process.exit(1)); }, 20 * 60_000);
  try {
    await run('Building actual Server', process.execPath, [path.join(server, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'], server, env);
    await run('Building actual Solver (locked)', 'cargo', ['build', '--locked'], solver, env);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), `meetpoint-browser-${id}-`));
    env.MEETPOINT_E2E_OUTPUT_DIR = path.join(directory, 'diagnostics');
    const stagedClient = path.join(directory, 'client');
    await fs.cp(client, stagedClient, { recursive: true, filter: (source) => {
      const name = path.basename(source);
      return !['node_modules', '.next', 'test-results', 'playwright-report', '.cache'].includes(name) && !name.startsWith('.env') && !name.endsWith('.tsbuildinfo');
    } });
    await fs.symlink(path.join(client, 'node_modules'), path.join(stagedClient, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await run('Building isolated Client (no development .next or .env)', process.execPath, [path.join(client, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], stagedClient, { ...env, NODE_ENV: 'production' });
    composeStarted = true;
    await run('Starting owned temporary PostgreSQL', 'docker', ['compose', '-f', composeFile, '-p', project, 'up', '-d', '--wait'], root, env);
    await ready('PostgreSQL', async () => {
      const probe = new Client({ connectionString: dbUrl.replace(`/${database}`, '/postgres') });
      try { await probe.connect(); await probe.query('SELECT 1'); return true; } finally { await probe.end(); }
    });
    admin = new Client({ connectionString: dbUrl.replace(`/${database}`, '/postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;
    await run('Applying real TypeORM migrations to temporary DB', process.execPath,
      ['-r', 'ts-node/register', '-e', "const d=require('./src/database/data-source').default; (async()=>{await d.initialize();await d.runMigrations();await d.destroy()})().catch(()=>process.exit(1))"], server, { ...env, NODE_ENV: 'test' });
    const solverProcess = launch(path.join(solver, `target/debug/solver${process.platform === 'win32' ? '.exe' : ''}`), [], directory, env);
    await ready('Solver', async () => (await fetch(`${env.SOLVER_BASE_URL}/health`, { signal: AbortSignal.timeout(1000) })).ok, solverProcess);
    // ConfigModule이 개발 .env를 읽지 않도록 임시 디렉터리에서 실행한다.
    const serverProcess = launch(process.execPath, [path.join(server, 'dist/main.js')], directory, env);
    await ready('Server', async () => (await fetch(`${api}/health`, { signal: AbortSignal.timeout(1000) })).ok, serverProcess);
    const clientProcess = launch(process.execPath, [path.join(client, 'node_modules/next/dist/bin/next'), 'start', '-p', String(clientPort), '-H', 'localhost'], stagedClient, { ...env, NODE_ENV: 'production' });
    await ready('Client', async () => (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok, clientProcess);
    if (!interrupted) await run('Running real Chromium scenarios', process.execPath, [path.join(client, 'node_modules/@playwright/test/cli.js'), 'test'], client, env, true);
  } catch (error) {
    // 연결 정보가 노출되지 않도록 오류 원문은 출력하지 않는다.
    console.error(error.message?.includes('failed') || error.message?.includes('readiness') ? error.message : 'Browser environment failed; check Docker, Cargo, package installs and the documented prerequisites.');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    try { await cleanup(env); } catch { console.error(`Test-only cleanup needs attention: ${project}.`); process.exitCode = 1; }
  }
}
void main();

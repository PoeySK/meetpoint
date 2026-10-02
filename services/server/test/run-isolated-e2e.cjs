const { Client } = require('pg');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

async function main() {
  let source;
  try {
    source = new URL(process.env.DATABASE_URL || 'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint');
  } catch {
    console.error('Invalid test DB connection configuration.');
    process.exitCode = 1;
    return;
  }
  const databaseName = `meetpoint_recovery_test_${randomBytes(8).toString('hex')}`;
  const admin = new Client({ connectionString: source.toString() });
  let created = false;
  let dataSource;
  let child;
  let interrupted = false;
  const interrupt = () => { interrupted = true; child?.kill('SIGTERM'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const timeout = setTimeout(interrupt, 120_000);
  try {
    await admin.connect();
    await admin.query('SELECT 1');
    if (process.env.RUN_CALCULATION_E2E === 'true') {
      const solverUrl = process.env.SOLVER_BASE_URL || 'http://localhost:4000';
      const health = await fetch(`${solverUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!health.ok) throw new Error('SolverNotReady');
      console.log('Actual Solver ready; calculation integration enabled.');
    } else {
      console.log('Calculation integration disabled; use RUN_CALCULATION_E2E=true for the full suite.');
    }
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    source.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = source.toString();
    process.env.NODE_ENV = 'test';
    require('ts-node/register');
    dataSource = require('../src/database/data-source').default;
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
    console.log('Isolated PostgreSQL test database migrated.');
    if (interrupted) throw new Error('TestInterrupted');
    // 중단 시 함께 종료할 수 있도록 Jest를 직접 실행한다.
    child = spawn(process.execPath, [path.resolve('node_modules/jest/bin/jest.js'), '--config', './test/jest-e2e.json', '--runInBand'], { stdio: 'inherit', env: process.env, windowsHide: true });
    process.exitCode = await new Promise((resolve) => {
      child.once('error', () => resolve(1));
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (interrupted) process.exitCode = 1;
  } catch (error) {
    // 연결 정보와 자격 증명이 담길 수 있는 오류 원문은 출력하지 않는다.
    console.error('Isolated e2e failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } catch {
      console.error('Test DataSource cleanup failed.');
      process.exitCode = 1;
    }
    try {
      if (created) {
        if (!/^meetpoint_recovery_test_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe test database name');
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        console.log('Isolated test database removed.');
      }
    } catch {
      console.error(`Owned test database cleanup needs attention: ${databaseName}.`);
      process.exitCode = 1;
    } finally {
      try { await admin.end(); } catch { process.exitCode = 1; }
    }
  }
}
void main();

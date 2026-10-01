// Creates and removes only its own database; never migrates the development database.
const { Client } = require('pg');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

async function main() {
  const source = new URL(process.env.DATABASE_URL || 'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint');
  const databaseName = `meetpoint_recovery_test_${randomBytes(8).toString('hex')}`;
  const admin = new Client({ connectionString: source.toString() });
  let created = false;
  let dataSource;
  try {
    await admin.connect();
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
    const result = spawnSync('pnpm test:e2e --runInBand', { shell: true, stdio: 'inherit', env: process.env });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    // Never print connection strings, driver query parameters, or credential-bearing errors.
    console.error('Isolated e2e failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (created) {
      if (!/^meetpoint_recovery_test_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe test database name');
      await admin.query(`DROP DATABASE "${databaseName}"`);
      console.log('Isolated test database removed.');
    }
    await admin.end();
  }
}
void main();

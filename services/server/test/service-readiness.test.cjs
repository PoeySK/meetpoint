const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { checkService, waitService } = require('./service-readiness.cjs');

test('readiness checks HTTP status, service and dependency contract', async () => {
  let status = 200;
  let body = { service: 'server', status: 'degraded', dependencies: { database: { status: 'down' } } };
  const server = http.createServer((_, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await checkService(url, 'server'), false);
    body = { service: 'server', status: 'ready', dependencies: { database: { status: 'up' } } };
    status = 503;
    assert.equal(await checkService(url, 'server'), false);
    status = 200;
    assert.equal(await checkService(url, 'server'), true);
    body = { service: 'solver', status: 'ok' };
    assert.equal(await checkService(url, 'solver'), true);
    assert.equal(await checkService(url, 'server'), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('wait fails immediately for an exited process', async () => {
  await assert.rejects(waitService('http://127.0.0.1:1', 'server', { isAlive: () => false }), /exited before readiness/);
});
test('a stalled endpoint cannot exceed the readiness deadline indefinitely', async () => {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const started = Date.now();
    await assert.rejects(waitService(`http://127.0.0.1:${server.address().port}`, 'server', { timeout: 100, interval: 5 }), /timed out/);
    assert.ok(Date.now() - started < 1500);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

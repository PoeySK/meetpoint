const { setTimeout: delay } = require('node:timers/promises');

async function checkService(url, service, timeout = 1000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (response.status !== 200) return false;
  const body = await response.json();
  return body.service === service && (service === 'server'
    ? body.status === 'ready' && body.dependencies?.database?.status === 'up'
    : body.status === 'ok');
}

async function waitService(url, service, { isAlive = () => true, timeout = 60000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error(`${service} exited before readiness.`);
    try {
      if (await checkService(url, service, Math.max(1, Math.min(1000, deadline - Date.now())))) return;
    } catch { /* 기동 중 연결 실패는 제한 시간 안에서 재검사한다. */ }
    if (!isAlive()) throw new Error(`${service} exited before readiness.`);
    await delay(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`${service} readiness timed out.`);
}
module.exports = { checkService, waitService };

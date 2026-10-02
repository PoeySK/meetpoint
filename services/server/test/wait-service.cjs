const { waitService } = require('./service-readiness.cjs');
const [url, service, pid] = process.argv.slice(2);
void waitService(url, service, {
  isAlive: () => {
    if (!pid) return true;
    try { process.kill(Number(pid), 0); return true; } catch { return false; }
  },
}).catch(error => { console.error(error.message); process.exitCode = 1; });

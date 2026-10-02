/* eslint-disable @typescript-eslint/no-require-imports */
// 원본 오류에 입력값·자격 증명이 담길 수 있어 안전한 요약만 남긴다.
const fs = require('node:fs');
const path = require('node:path');

module.exports = class SafeReporter {
  constructor() { this.results = []; }
  onTestEnd(test, result) {
    const location = result.errors[0]?.stack?.match(/meetpoint\.spec\.ts:(\d+):\d+/)?.[1];
    const item = { title: test.title, status: result.status, durationMs: result.duration, failureLine: location ?? null };
    this.results.push(item);
    console.log(`${item.status}: ${item.title}${location ? ` (meetpoint.spec.ts:${location})` : ''}`);
  }
  onError() { console.error('Browser runner error; raw credential-bearing diagnostics suppressed.'); }
  onEnd(result) {
    const directory = path.resolve(__dirname, '../../test-results');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'safe-summary.json'), JSON.stringify({ status: result.status, tests: this.results }, null, 2));
    console.log(`Browser suite: ${result.status}. Safe summary: test-results/safe-summary.json`);
  }
};

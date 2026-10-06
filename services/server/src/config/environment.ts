export function validateEnvironment(env: Record<string, string | undefined>) {
  const fail = (name: string): never => {
    throw new Error(`Invalid environment variable: ${name}`);
  };
  const production = env.NODE_ENV === 'production';
  for (const [name, protocols] of [
    ['DATABASE_URL', ['postgres:', 'postgresql:']],
    ['SOLVER_BASE_URL', ['http:', 'https:']],
  ] as const) {
    if (env[name] === undefined && !production) continue;
    try {
      const url = new URL(String(env[name]));
      if (
        !(protocols as readonly string[]).includes(url.protocol) ||
        !url.hostname
      )
        fail(name);
      if (
        name === 'DATABASE_URL' &&
        (!url.username || !url.password || url.pathname.length <= 1)
      )
        fail(name);
    } catch {
      fail(name);
    }
  }
  if (env.CLIENT_ORIGIN !== undefined || production) {
    const origins = String(env.CLIENT_ORIGIN ?? '').split(',');
    if (production && origins.length !== 1) fail('CLIENT_ORIGIN');
    for (const origin of origins) {
      try {
        const url = new URL(origin.trim());
        if (
          url.origin !== origin.trim() ||
          url.username ||
          url.password ||
          !['http:', 'https:'].includes(url.protocol) ||
          (production && url.protocol !== 'https:')
        )
          fail('CLIENT_ORIGIN');
      } catch {
        fail('CLIENT_ORIGIN');
      }
    }
  }
  for (const name of [
    'SERVER_PORT',
    'PORT',
    'SOLVER_RESPONSE_TIMEOUT_MS',
    'CALCULATION_JOB_POLL_INTERVAL_MS',
    'CALCULATION_JOB_LEASE_MS',
    'CALCULATION_JOB_RETRY_DELAY_MS',
    'CALCULATION_JOB_MAX_ATTEMPTS',
  ]) {
    if (env[name] === undefined) continue;
    const value = String(env[name]);
    const number = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(number) ||
      number < 1 ||
      number > (name.endsWith('PORT') ? 65535 : 2147483647)
    )
      fail(name);
  }
  return env;
}

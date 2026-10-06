import { validateEnvironment } from './environment';

describe('deployment environment', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://test:test@postgres:5432/test',
    SOLVER_BASE_URL: 'http://solver:4000',
    CLIENT_ORIGIN: 'https://meet.example.com',
  };
  it('preserves local defaults and accepts explicit production settings', () => {
    expect(validateEnvironment({})).toEqual({});
    expect(validateEnvironment(production)).toEqual(production);
  });
  it.each(['DATABASE_URL', 'SOLVER_BASE_URL', 'CLIENT_ORIGIN'])(
    'requires %s in production',
    (name) => {
      expect(() =>
        validateEnvironment({ ...production, [name]: undefined })
      ).toThrow(name);
    }
  );
  it.each([
    ['DATABASE_URL', 'http://private:secret@postgres/db'],
    ['DATABASE_URL', 'postgresql://test:test@postgres'],
    ['CLIENT_ORIGIN', 'http://meet.example.com'],
    ['CLIENT_ORIGIN', 'https://meet.example.com/path'],
    ['SERVER_PORT', '3001oops'],
    ['SERVER_PORT', '65536'],
    ['CALCULATION_JOB_LEASE_MS', '0'],
    ['SOLVER_RESPONSE_TIMEOUT_MS', 'NaN'],
  ])('rejects invalid %s without exposing its value', (name, value) => {
    expect(() => validateEnvironment({ ...production, [name]: value })).toThrow(
      `Invalid environment variable: ${name}`
    );
  });
});

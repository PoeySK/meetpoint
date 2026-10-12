import { requiresResponseReconfirmation } from './candidate-response-change';

const candidate = () => ({
  time: {
    startsAt: '2026-10-12T18:00:00+09:00',
    endsAt: '2026-10-12T20:00:00+09:00',
    timezone: 'Asia/Seoul',
  },
  place: { name: 'Cafe', address: 'Seoul 1', area: 'Seoul' },
  estimatedCostPerPersonKrw: 10000,
  tags: ['INDOOR', 'QUIET'],
});

describe('Candidate changes requiring response reconfirmation', () => {
  it.each([
    'start',
    'end',
    'name',
    'address',
    'cost increase',
    'cost decrease',
    'tags',
  ])('requires reconfirmation for %s', (field) => {
    const next = candidate();
    if (field === 'start') next.time.startsAt = '2026-10-12T19:00:00+09:00';
    if (field === 'end') next.time.endsAt = '2026-10-12T21:00:00+09:00';
    if (field === 'name') next.place.name = 'Cafe 2';
    if (field === 'address') next.place.address = 'Seoul 2';
    if (field === 'cost increase') next.estimatedCostPerPersonKrw = 11000;
    if (field === 'cost decrease') next.estimatedCostPerPersonKrw = 9000;
    if (field === 'tags') next.tags = ['INDOOR'];
    expect(requiresResponseReconfirmation(candidate(), next)).toBe(true);
  });

  it('ignores equivalent instants, timezone display, trimmed places, tag order/case/duplicates and area', () => {
    const next = candidate();
    next.time = {
      startsAt: '2026-10-12T09:00:00Z',
      endsAt: '2026-10-12T11:00:00Z',
      timezone: 'UTC',
    };
    next.place = { name: ' Cafe ', address: ' Seoul 1 ', area: 'Display only' };
    next.tags = [' quiet ', 'indoor', 'INDOOR'];
    expect(requiresResponseReconfirmation(candidate(), next)).toBe(false);
  });
});

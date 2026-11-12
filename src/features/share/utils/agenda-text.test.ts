import type { CalendarItem } from '@/types';

import { countTally, groupByDay } from './agenda-text';

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    id: 'task:1:2026-11-11',
    title: 'Item',
    date: '2026-11-11',
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    status: 'planned',
    sourceType: 'task',
    sourceId: '1',
    icon: '',
    color: 'gold',
    ...overrides,
  };
}

describe('countTally', () => {
  it('leaves events out of both numbers', () => {
    const items = [
      item({ status: 'done' }),
      item({ id: 'task:2', status: 'planned' }),
      item({ id: 'event:3', sourceType: 'event' }),
    ];
    expect(countTally(items)).toEqual({ done: 1, total: 2 });
  });

  it('is empty when there is nothing but events', () => {
    expect(countTally([item({ sourceType: 'event' })])).toEqual({ done: 0, total: 0 });
  });
});

describe('groupByDay', () => {
  it('orders days, then clock time, with untimed items last', () => {
    const days = groupByDay([
      item({ id: 'a', title: 'All day', startTime: null, endTime: null }),
      item({ id: 'b', title: 'Late', startTime: '18:00' }),
      item({ id: 'c', title: 'Early', startTime: '07:00' }),
      item({ id: 'd', title: 'Next day', date: '2026-11-12' }),
    ]);

    expect(days.map((day) => day.date)).toEqual(['2026-11-11', '2026-11-12']);
    expect(days[0]?.items.map((entry) => entry.title)).toEqual(['Early', 'Late', 'All day']);
  });
});

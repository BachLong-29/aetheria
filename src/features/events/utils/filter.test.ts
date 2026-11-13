import type { EventDTO } from '@/types';

import { filterEvents } from './filter';

function event(over: Partial<EventDTO>): EventDTO {
  return { id: 'e1', title: 'Running man', startDate: '2026-11-13', ...over } as EventDTO;
}

describe('filterEvents', () => {
  const list = [
    event({ id: 'a', title: 'Ăn trưa với team' }),
    event({ id: 'b', title: 'Running man', note: 'TV show Friday' }),
    event({ id: 'c', title: 'Gym' }),
  ];

  it('matches the title', () => {
    expect(filterEvents(list, 'gym').map((e) => e.id)).toEqual(['c']);
  });

  it('matches the note', () => {
    expect(filterEvents(list, 'friday').map((e) => e.id)).toEqual(['b']);
  });

  it('ignores case and accents', () => {
    expect(filterEvents(list, 'AN TRUA').map((e) => e.id)).toEqual(['a']);
  });

  it('returns everything for a blank query', () => {
    expect(filterEvents(list, '   ')).toHaveLength(3);
  });

  it('copes with a missing note and gives [] when nothing hits', () => {
    expect(filterEvents(list, 'zzz')).toEqual([]);
  });
});

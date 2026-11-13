import { matchesQuery } from '@/libs/utils/text-search';
import type { EventDTO } from '@/types';

/** Events whose title or note contains `query`, ignoring case and accents. A blank query keeps all. */
export function filterEvents(events: EventDTO[], query: string): EventDTO[] {
  return events.filter(
    (event) => matchesQuery(event.title, query) || matchesQuery(event.note ?? '', query),
  );
}

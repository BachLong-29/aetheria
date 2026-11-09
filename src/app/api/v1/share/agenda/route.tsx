import { ImageResponse } from 'next/og';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { buildCalendar } from '@/server/services/schedule-engine';
import { asyncHandler, unauthorizedResponse } from '@/server';
import { validateSearchParams } from '@/server/validate';
import { locales } from '@/i18n/config';
import {
  OG_BG,
  OG_BORDER,
  OG_GOLD,
  OG_SURFACE,
  OG_TEXT_HI,
  OG_TEXT_LO,
  OG_TEXT_MID,
  ogItemColor,
  ogMaxRows,
} from '@/features/share/constants/og-palette';
import { groupByDay } from '@/features/share/utils/agenda-text';
import { OG_FONT_FAMILY, loadOgFonts } from '@/features/share/utils/og-fonts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  from: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
  to: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
  // Every word on the card is worded by the client, where the active locale
  // lives — this route only lays them out.
  heading: z.string().min(1).max(80),
  scopeLabel: z.string().min(1).max(40),
  emptyLabel: z.string().min(1).max(80),
  summaryLabel: z.string().max(80).optional(),
  moreLabel: z.string().max(40).optional(),
  /** Names the days on a week card; validated against the app's own locales. */
  locale: z.enum(locales),
});

const WIDTH = 1000;

// ImageResponse falls back to a fixed 1200x630 canvas, which would either clip a
// long agenda or leave a short one floating in empty space. Height is measured
// from the content instead.
const PADDING = 48;
const HEADING_H = 110;
const DAY_HEAD_H = 46;
const ROW_H = 72;
const OVERFLOW_H = 34;
const TALLY_H = 72;
const EMPTY_H = 48;

function cardHeight(rowCount: number, dayHeadings: number, hasOverflow: boolean): number {
  if (rowCount === 0) return PADDING * 2 + HEADING_H + EMPTY_H;
  return (
    PADDING * 2 +
    HEADING_H +
    dayHeadings * DAY_HEAD_H +
    rowCount * ROW_H +
    (hasOverflow ? OVERFLOW_H : 0) +
    TALLY_H
  );
}

/**
 * Render the agenda as a PNG.
 *
 * Deliberately glyph-free: the bundled Geist covers Latin and Vietnamese but
 * not Thai or `✓`, and Satori draws no emoji without fetching them at render
 * time. So status and category are carried by colour and weight, never by a
 * character that might land as tofu.
 */
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data: query, error } = validateSearchParams(req.nextUrl.searchParams, querySchema);
  if (error) return error;

  await connectDB();

  const items = await buildCalendar(user.sub, query.from, query.to);
  const isWeek = query.from !== query.to;
  const days = groupByDay(items);

  // Cut whole items, never mid-row: fill days in order until the cap is hit.
  const cap = ogMaxRows(isWeek ? 'week' : 'day');
  const visibleDays: typeof days = [];
  let shown = 0;
  for (const day of days) {
    if (shown >= cap) break;
    const slice = day.items.slice(0, cap - shown);
    visibleDays.push({ date: day.date, items: slice });
    shown += slice.length;
  }
  const overflow = items.length - shown;

  // A single day is already named by the heading — only a week needs day rows.
  const dayFormatter = new Intl.DateTimeFormat(query.locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

  return new ImageResponse(
    <div
      style={{
        width: WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: OG_BG,
        padding: PADDING,
        fontFamily: OG_FONT_FAMILY,
        fontSize: 28,
        color: OG_TEXT_HI,
      }}
    >
      {/* Heading */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
        <div style={{ fontSize: 18, letterSpacing: 6, color: OG_GOLD, textTransform: 'uppercase' }}>
          {query.scopeLabel}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, marginTop: 8 }}>{query.heading}</div>
      </div>

      {items.length === 0 ? (
        <div style={{ display: 'flex', color: OG_TEXT_MID, fontSize: 30 }}>{query.emptyLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleDays.map((day) => (
            <div key={day.date} style={{ display: 'flex', flexDirection: 'column' }}>
              {isWeek && (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 22,
                    letterSpacing: 2,
                    color: OG_GOLD,
                    textTransform: 'uppercase',
                    marginTop: 4,
                    marginBottom: 10,
                  }}
                >
                  {dayFormatter.format(new Date(`${day.date}T00:00:00`))}
                </div>
              )}

              {day.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: OG_SURFACE,
                    border: `1px solid ${OG_BORDER}`,
                    borderLeft: `6px solid ${ogItemColor(item.color)}`,
                    borderRadius: 10,
                    padding: '14px 20px',
                    marginBottom: 10,
                    // A finished item recedes rather than gaining a tick glyph.
                    opacity: item.status === 'done' ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: 'flex', width: 150, color: OG_TEXT_LO, fontSize: 24 }}>
                    {item.startTime ?? '—'}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flex: 1,
                      textDecoration: item.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {overflow > 0 && query.moreLabel && (
            <div style={{ display: 'flex', color: OG_TEXT_LO, fontSize: 22, marginTop: 6 }}>
              {query.moreLabel}
            </div>
          )}
        </div>
      )}

      {/* Tally */}
      {items.length > 0 && query.summaryLabel && (
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            paddingTop: 20,
            borderTop: `1px solid ${OG_BORDER}`,
            color: OG_TEXT_MID,
            fontSize: 24,
          }}
        >
          {query.summaryLabel}
        </div>
      )}
    </div>,
    {
      width: WIDTH,
      height: cardHeight(shown, isWeek ? visibleDays.length : 0, overflow > 0),
      fonts: await loadOgFonts(),
    },
  );
});

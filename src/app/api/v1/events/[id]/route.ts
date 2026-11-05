import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { releaseUploads } from '@/server/helpers/upload-cleanup';
import { EventModel } from '@/server/models/event.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';

import { checkShape, recurrenceSchema, serialize } from '../route';

const EVENT_COLORS = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    note: z.string().max(500).nullable().optional(),
    tagId: z.string().min(1).optional(),
    color: z.enum(EVENT_COLORS).optional(),
    icon: z.string().min(1).optional(),
    allDay: z.boolean().optional(),
    startTime: z.string().regex(TIME_RE, 'Must be HH:MM').nullable().optional(),
    duration: z.number().int().min(1).max(1440).nullable().optional(),
    startDate: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').nullable().optional(),
    recurrence: recurrenceSchema.nullable().optional(),
    busy: z.boolean().optional(),
    paused: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Only enforce the shape rules on a payload that actually sets the fields.
    if (data.allDay === false && (data.startTime !== undefined || data.duration !== undefined)) {
      checkShape(
        {
          allDay: false,
          startTime: data.startTime ?? undefined,
          duration: data.duration ?? undefined,
        },
        ctx,
      );
    }
    if (data.recurrence) checkShape({ recurrence: data.recurrence }, ctx);
  });

// PATCH /api/v1/events/:id — edits the whole series
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  /** null clears the field, undefined leaves it alone. */
  function put<T>(key: string, value: T | null | undefined, map: (v: T) => unknown = (v) => v) {
    if (value === undefined) return;
    if (value === null) unset[key] = '';
    else set[key] = map(value);
  }

  for (const key of [
    'title',
    'tagId',
    'color',
    'icon',
    'busy',
    'paused',
    'active',
    'allDay',
  ] as const) {
    if (data[key] !== undefined) set[key] = data[key];
  }
  put('note', data.note);
  if (data.startDate) set.startDate = new Date(data.startDate);
  put('endDate', data.endDate, (v) => new Date(v));

  if (data.recurrence === null) {
    unset.recurrence = '';
    // A one-off cannot carry the end bound of a rule that no longer exists.
    unset.endDate = '';
  } else if (data.recurrence !== undefined) {
    set.recurrence = data.recurrence;
  }

  // Turning an event all-day drops its time; both fields move together.
  if (data.allDay === true) {
    unset.startTime = '';
    unset.duration = '';
  } else {
    put('startTime', data.startTime);
    put('duration', data.duration);
  }

  const before =
    data.icon !== undefined
      ? await EventModel.findOne({ _id: id, userId: user.sub }).select('icon').lean()
      : null;

  const event = await EventModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    {
      ...(Object.keys(set).length > 0 && { $set: set }),
      ...(Object.keys(unset).length > 0 && { $unset: unset }),
    },
    { new: true, runValidators: true },
  );
  if (!event) return notFoundResponse('Event not found');

  if (before) await releaseUploads(user.sub, [before.icon]);

  return successResponse(serialize(event), 'Event updated successfully');
});

// DELETE /api/v1/events/:id — soft delete, overrides go with the series
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const event = await EventModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: { active: false } },
    { new: true },
  );
  if (!event) return notFoundResponse('Event not found');

  // Overrides only exist to amend this series — retire them together so none
  // is left stranded on the calendar.
  await EventModel.updateMany({ userId: user.sub, seriesRef: id }, { $set: { active: false } });

  return successResponse(null, 'Event deleted successfully');
});

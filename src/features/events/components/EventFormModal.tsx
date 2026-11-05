'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/common/Icon';
import { IconPickerSheet } from '@/components/common/IconPickerSheet';
import { isUploadedIcon } from '@/components/common/icon-registry';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useCategories } from '@/features/dashboard/hooks/useCategories';
import { COLOR_CSS, COLOR_OPTIONS } from '@/features/projects/constants';
import { cn } from '@/libs/utils';
import type { EventDTO, EventFrequency, TaskColor } from '@/types';
import type { HabitDay } from '@/types/habit';

import { DAY_ORDER, DEFAULT_EVENT_ICON } from '../constants';
import { useCreateEvent, useUpdateEvent } from '../hooks/useEvents';

/** `startDate` travels as a plain "YYYY-MM-DD" string, so convert at the edges. */
function toDateString(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

type FormErrors = Partial<Record<'title' | 'tagId' | 'startDate' | 'time' | 'days', string>>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set the modal edits this rule instead of creating one. */
  event?: EventDTO | null;
}

export function EventFormModal({ open, onClose, event }: Props) {
  const t = useTranslations('events');
  const tc = useTranslations('common');
  const isEdit = Boolean(event);
  const { data: categories = [] } = useCategories();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const saving = createEvent.isPending || updateEvent.isPending;

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tagId, setTagId] = useState('');
  const [color, setColor] = useState<TaskColor>('violet');
  const [icon, setIcon] = useState(DEFAULT_EVENT_ICON);
  const [showPicker, setShowPicker] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repeats, setRepeats] = useState(false);
  const [freq, setFreq] = useState<EventFrequency>('weekly');
  const [days, setDays] = useState<HabitDay[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [interval, setIntervalValue] = useState('1');
  const [busy, setBusy] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);

  // Reload the draft whenever the modal opens — no effect needed, this runs
  // during render only on the open/close edge.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(event?.title ?? '');
      setNote(event?.note ?? '');
      setTagId(event?.tagId ?? '');
      setColor(event?.color ?? 'violet');
      setIcon(event?.icon ?? DEFAULT_EVENT_ICON);
      setShowPicker(false);
      setAllDay(event?.allDay ?? false);
      setStartTime(event?.startTime ?? '09:00');
      setDuration(event?.duration ? String(event.duration) : '60');
      setStartDate(event?.startDate ?? toDateString(new Date()));
      setEndDate(event?.endDate ?? '');
      setRepeats(Boolean(event?.recurrence));
      setFreq(event?.recurrence?.freq ?? 'weekly');
      setDays(event?.recurrence?.days ?? []);
      setDayOfMonth(String(event?.recurrence?.dayOfMonth ?? 1));
      setIntervalValue(String(event?.recurrence?.interval ?? 1));
      setBusy(event?.busy ?? true);
      setErrors({});
      setSaveFailed(false);
    }
  }

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  function toggleDay(day: HabitDay) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    clearError('days');
  }

  /** Mirrors the zod schema in src/app/api/v1/events/route.ts — keep in sync. */
  function validate(): FormErrors {
    const found: FormErrors = {};
    if (!title.trim()) found.title = t('form.errors.title');
    if (!tagId) found.tagId = t('form.errors.category');
    if (!startDate) found.startDate = t('form.errors.startDate');
    if (!allDay && (!startTime || !Number(duration))) found.time = t('form.errors.time');
    if (repeats && freq === 'weekly' && days.length === 0) found.days = t('form.errors.days');
    return found;
  }

  async function handleSave() {
    const found = validate();
    setErrors(found);
    setSaveFailed(false);
    if (Object.values(found).some(Boolean)) return;

    const recurrence = repeats
      ? {
          freq,
          interval: Math.max(1, Number(interval) || 1),
          ...(freq === 'weekly'
            ? { days: DAY_ORDER.filter((d) => days.includes(d)) }
            : { dayOfMonth: Math.min(31, Math.max(1, Number(dayOfMonth) || 1)) }),
        }
      : undefined;

    const shared = {
      title: title.trim(),
      tagId,
      color,
      icon,
      allDay,
      startTime: allDay ? undefined : startTime,
      duration: allDay ? undefined : Number(duration),
      startDate,
      busy,
    };

    try {
      if (isEdit && event) {
        await updateEvent.mutateAsync({
          id: event.id,
          ...shared,
          note: note.trim() || null,
          startTime: allDay ? null : startTime,
          duration: allDay ? null : Number(duration),
          endDate: recurrence && endDate ? endDate : null,
          recurrence: recurrence ?? null,
        });
      } else {
        await createEvent.mutateAsync({
          ...shared,
          note: note.trim() || undefined,
          endDate: recurrence && endDate ? endDate : undefined,
          recurrence,
        });
      }
      onClose();
    } catch {
      // Keep the draft on screen — closing here would throw the form away.
      setSaveFailed(true);
    }
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Modal open={open} onClose={onClose} maxWidth="480px" scrollable>
      <ModalHead
        tag={t('page.eyebrow')}
        title={`📅 ${isEdit ? t('form.titleEdit') : t('form.titleNew')}`}
      />
      <ModalBody scrollable className="flex flex-col gap-4">
        <Field label={t('form.icon')}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              disabled={saving}
              aria-haspopup="dialog"
              className={cn(
                'flex h-11 w-11 items-center justify-center text-[22px] transition-all duration-150',
                'rounded-[var(--r-md)] border bg-[var(--bg-2)]',
                showPicker
                  ? 'border-[var(--gold)] shadow-[0_0_10px_oklch(0.74_0.17_85_/_0.3)]'
                  : 'border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--bg-3)]',
              )}
            >
              <Icon icon={icon} />
            </button>
          </div>
          {isUploadedIcon(icon) && (
            <p className="text-[9px] text-[var(--text-lo)]">{t('form.uploadedHint')}</p>
          )}
          {showPicker && (
            <IconPickerSheet
              title={t('form.icon')}
              value={icon}
              onChange={setIcon}
              onClose={() => setShowPicker(false)}
            />
          )}
        </Field>

        <Field label={t('form.title')} required error={errors.title}>
          <Input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError('title');
            }}
            placeholder={t('form.titlePlaceholder')}
            disabled={saving}
          />
        </Field>

        <Field label={t('form.note')}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('form.notePlaceholder')}
            disabled={saving}
          />
        </Field>

        <Field label={t('form.category')} required error={errors.tagId}>
          <Select
            options={categoryOptions}
            value={tagId}
            onValueChange={(v) => {
              setTagId(v);
              clearError('tagId');
            }}
            placeholder={t('form.categoryPlaceholder')}
            disabled={saving}
          />
        </Field>

        {/* Seven swatches need the full width — halved they wrap onto two rows. */}
        <Field label={t('form.colour')}>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-label={t(`colors.${opt.value}`)}
                aria-pressed={color === opt.value}
                onClick={() => setColor(opt.value)}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-transform',
                  color === opt.value
                    ? 'scale-110 border-[var(--text-hi)]'
                    : 'border-transparent hover:scale-105',
                )}
                style={{ background: COLOR_CSS[opt.value] }}
              />
            ))}
          </div>
        </Field>

        <Field
          label={repeats ? t('form.startsOn') : t('form.date')}
          required
          error={errors.startDate}
        >
          <DatePicker
            value={startDate ? parseDateString(startDate) : null}
            onChange={(d) => {
              setStartDate(toDateString(d));
              clearError('startDate');
            }}
            disabled={saving}
          />
        </Field>

        <Switch checked={allDay} onChange={setAllDay} disabled={saving}>
          {t('form.allDay')}
        </Switch>

        {!allDay && (
          <Field label={t('form.time')} error={errors.time}>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  clearError('time');
                }}
                disabled={saving}
              />
              <Input
                type="number"
                min={1}
                max={1440}
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  clearError('time');
                }}
                placeholder={t('form.minutes')}
                disabled={saving}
              />
            </div>
          </Field>
        )}

        <Switch checked={repeats} onChange={setRepeats} disabled={saving}>
          {t('form.repeats')}
        </Switch>

        {repeats && (
          <div className="flex flex-col gap-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-2)] p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.frequency')}>
                <Select
                  options={[
                    { value: 'weekly', label: t('schedule.weekly') },
                    { value: 'monthly', label: t('schedule.monthly') },
                  ]}
                  value={freq}
                  onValueChange={(v) => setFreq(v as EventFrequency)}
                  disabled={saving}
                />
              </Field>
              <Field label={freq === 'weekly' ? t('form.everyNWeeks') : t('form.everyNMonths')}>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={interval}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            {freq === 'weekly' ? (
              <Field label={t('form.onDays')} required error={errors.days}>
                <div className="flex gap-1">
                  {DAY_ORDER.map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-label={t(`days.${day}`)}
                      aria-pressed={days.includes(day)}
                      onClick={() => toggleDay(day)}
                      disabled={saving}
                      className={cn(
                        'flex-1 rounded-[var(--r-sm)] border py-1.5 text-[11px] font-bold transition-colors',
                        days.includes(day)
                          ? 'border-[var(--gold)] bg-[oklch(0.74_0.17_85_/_0.15)] text-[var(--gold)]'
                          : 'border-[var(--border)] text-[var(--text-lo)] hover:text-[var(--text-mid)]',
                      )}
                    >
                      {t(`dayLetters.${day}`)}
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <Field label={t('form.dayOfMonth')}>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  disabled={saving}
                />
                <p className="mt-1 text-[10px] text-[var(--text-lo)]">{t('form.dayOfMonthHint')}</p>
              </Field>
            )}

            <Field label={t('form.endsOn')}>
              <DatePicker
                value={endDate ? parseDateString(endDate) : null}
                onChange={(d) => setEndDate(toDateString(d))}
                onClear={() => setEndDate('')}
                placeholder={t('form.never')}
                disabled={saving}
              />
            </Field>
          </div>
        )}

        <Switch checked={busy} onChange={setBusy} disabled={saving}>
          {t('form.busy')}
        </Switch>
        <p className="-mt-2 text-[10px] text-[var(--text-lo)]">{t('form.busyHint')}</p>

        {saveFailed && (
          <p role="alert" className="text-[11px] text-[var(--rose)]">
            ✕ {t('form.saveFailed')}
          </p>
        )}
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          {tc('cancel')}
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? '…' : isEdit ? t('form.saveChanges') : t('form.create')}
        </Button>
      </ModalFoot>
    </Modal>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-mid)] [font-family:var(--f-title)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--rose)]">*</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-[10px] leading-tight text-[var(--rose)]">
          {error}
        </p>
      )}
    </div>
  );
}

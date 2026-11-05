'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';
import type { EventOccurrence } from '@/types';

/** Occurrence dates travel as plain "YYYY-MM-DD" strings, so convert at the edges. */
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

interface Props {
  /** The occurrence being edited; null closes the modal. */
  occurrence: EventOccurrence | null;
  onClose: () => void;
  /** Move this one occurrence — the series stays as it is. */
  onMove: (occurrence: EventOccurrence, change: { newDate: string; startTime?: string }) => void;
  onSkip: (occurrence: EventOccurrence) => void;
  saving?: boolean;
}

/**
 * One occurrence of a repeating event: move it to another day or time, or skip it. Both write an
 * override row, so the repeating event itself is never touched.
 */
export function OccurrenceModal({ occurrence, onClose, ...rest }: Props) {
  return (
    <Modal open={occurrence !== null} onClose={onClose} maxWidth="380px">
      {/* Keyed, so each occurrence starts from its own date and time. */}
      {occurrence && <OccurrenceForm key={occurrence.id} occurrence={occurrence} {...rest} />}
    </Modal>
  );
}

function OccurrenceForm({
  occurrence,
  onMove,
  onSkip,
  saving,
}: Omit<Props, 'occurrence' | 'onClose'> & { occurrence: EventOccurrence }) {
  const t = useTranslations('events.occurrence');
  const [date, setDate] = useState(occurrence.date);
  const [time, setTime] = useState(occurrence.startTime ?? '');

  const timed = !occurrence.allDay;
  const unchanged = date === occurrence.date && time === (occurrence.startTime ?? '');
  const canMove = !!date && (!timed || !!time) && !unchanged;

  return (
    <>
      <ModalHead title={`↻ ${occurrence.title}`} />
      <ModalBody>
        <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-mid)]">
          {t('hint', { date: occurrence.date })}
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t('date')}</span>
            <DatePicker
              value={date ? parseDateString(date) : null}
              onChange={(d) => setDate(toDateString(d))}
              disabled={saving}
            />
          </div>
          {timed && (
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabel}>{t('time')}</span>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={saving}
              />
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFoot>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onSkip(occurrence)}
            disabled={saving}
            className="w-full justify-center sm:mr-auto sm:w-auto"
          >
            {t('skip')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onMove(occurrence, { newDate: date, ...(timed && { startTime: time }) })}
            disabled={!canMove || saving}
            className="w-full justify-center sm:w-auto"
          >
            {t('move')}
          </Button>
        </div>
      </ModalFoot>
    </>
  );
}

const fieldLabel =
  'text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-mid)] [font-family:var(--f-title)]';

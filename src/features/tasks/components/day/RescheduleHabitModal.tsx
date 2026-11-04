'use client';

import { useState } from 'react';

import { cn } from '@/libs/utils';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';

import type { UITask } from '../../data/mock';
import { Icon } from '@/components/common/Icon';

// ─── Slot presets ──────────────────────────────────────────────────────────────

interface SlotPreset {
  slot: 'morning' | 'deep' | 'afternoon' | 'evening';
  glyph: string;
  label: string;
  time: string;
  color: string;
}

const SLOT_PRESETS: [SlotPreset, SlotPreset, SlotPreset, ...SlotPreset[]] = [
  { slot: 'morning', glyph: '◐', label: 'Dawn', time: '07:00', color: 'oklch(0.74 0.17 85)' },
  { slot: 'deep', glyph: '❖', label: 'Deep Work', time: '10:00', color: 'oklch(0.66 0.22 295)' },
  {
    slot: 'afternoon',
    glyph: '☉',
    label: 'Afternoon',
    time: '14:00',
    color: 'oklch(0.76 0.16 205)',
  },
  { slot: 'evening', glyph: '☾', label: 'Twilight', time: '19:00', color: 'oklch(0.72 0.18 5)' },
];

// ─── Props ──────���────────────────────────────────��────────────────────────────

interface RescheduleHabitModalProps {
  task: UITask;
  onConfirm: (newTime: string) => void;
  onClose: () => void;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RescheduleHabitModal({
  task,
  onConfirm,
  onClose,
  loading,
}: RescheduleHabitModalProps) {
  const currentTime = task.startTime ?? '';

  const defaultPreset = SLOT_PRESETS.find((p) => p.time !== currentTime) ?? SLOT_PRESETS[2];

  const [selectedTime, setSelectedTime] = useState(defaultPreset.time);
  const [customTime, setCustomTime] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const activeTime = useCustom ? customTime : selectedTime;

  const habitName = task.title;

  function handleConfirm() {
    const time = activeTime.trim();
    if (!time) return;
    onConfirm(time);
  }

  return (
    <Modal open onClose={onClose} maxWidth="380px" closeButton>
      <ModalHead tag="Hourglass" title="Reschedule Ritual" />
      <ModalBody>
        <div className="flex flex-col gap-4">
          {/* Habit identity */}
          <div className="flex items-center gap-2 p-2.5 bg-[var(--panel2)] border border-[var(--border)] rounded-[var(--r-sm)]">
            <span className="text-[20px] leading-none shrink-0">
              <Icon icon={task.icon} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-[var(--text-hi)] truncate">
                {habitName}
              </div>
              <div className="text-[9px] text-[var(--text-lo)]">
                {currentTime ? `Currently at ${currentTime}` : 'No scheduled time'}
              </div>
            </div>
            {currentTime && (
              <span className="text-[9px] font-bold text-[var(--text-lo)] bg-[var(--panel)] border border-[var(--border)] px-1.5 py-0.5 rounded shrink-0">
                {currentTime}
              </span>
            )}
          </div>

          {/* Slot presets */}
          <div>
            <div className="text-[8px] tracking-[0.12em] text-[var(--text-lo)] font-bold font-[var(--font-title)] uppercase mb-2">
              Move to
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SLOT_PRESETS.map((preset) => {
                const isActive = !useCustom && selectedTime === preset.time;
                const isCurrent = preset.time === currentTime;
                return (
                  <button
                    key={preset.slot}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => {
                      setSelectedTime(preset.time);
                      setUseCustom(false);
                    }}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-[var(--r-sm)] border text-left transition-all duration-150',
                      isActive
                        ? 'border-[var(--gold)] bg-[oklch(0.74_0.17_85_/_0.1)] shadow-[0_0_8px_oklch(0.74_0.17_85_/_0.2)]'
                        : 'border-[var(--border)] hover:border-[oklch(0.74_0.17_85_/_0.3)] hover:bg-[var(--panel2)]',
                      isCurrent && 'opacity-30 cursor-not-allowed',
                    )}
                  >
                    <span
                      className="text-[14px] leading-none shrink-0"
                      style={{ color: preset.color }}
                    >
                      {preset.glyph}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold text-[var(--text-hi)] font-[var(--font-title)] tracking-[0.06em]">
                        {preset.label}
                      </div>
                      <div className="text-[8px] text-[var(--text-lo)]">{preset.time}</div>
                    </div>
                    {isCurrent && (
                      <span className="ml-auto text-[7px] text-[var(--text-dim)] shrink-0">
                        current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom time */}
          <div>
            <div className="text-[8px] tracking-[0.12em] text-[var(--text-lo)] font-bold font-[var(--font-title)] uppercase mb-1.5">
              Custom time (optional)
            </div>
            <input
              type="time"
              value={customTime}
              onChange={(e) => {
                setCustomTime(e.target.value);
                setUseCustom(!!e.target.value);
              }}
              className={cn(
                'w-full px-3 py-2 bg-[var(--panel2)] border rounded-[var(--r-sm)] text-[11px] text-[var(--text-hi)] transition-colors outline-none',
                useCustom
                  ? 'border-[var(--gold)] ring-1 ring-[oklch(0.74_0.17_85_/_0.2)]'
                  : 'border-[var(--border)] focus:border-[oklch(0.74_0.17_85_/_0.5)]',
              )}
            />
          </div>

          {/* Preview */}
          {activeTime && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[oklch(0.74_0.17_85_/_0.06)] border border-[oklch(0.74_0.17_85_/_0.2)] rounded-[var(--r-sm)]">
              <span className="text-[var(--gold)] text-[10px]">↷</span>
              <span className="text-[9px] text-[var(--text-mid)]">
                <span className="font-bold text-[var(--text-hi)]">{habitName}</span> will move to{' '}
                <span className="font-bold text-[var(--gold)]">{activeTime}</span>
              </span>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFoot>
        <button type="button" className={footerGhostBtn} onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          type="button"
          className={footerConfirmBtn}
          onClick={handleConfirm}
          disabled={!activeTime || loading}
        >
          {loading ? '⏳ Moving…' : '↷ Reschedule'}
        </button>
      </ModalFoot>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const footerGhostBtn =
  'text-[9px] font-bold px-3 py-1.5 rounded border border-[var(--border)] text-[var(--text-lo)] font-[var(--font-title)] tracking-[0.08em] transition-all hover:text-[var(--text-mid)] disabled:opacity-40 disabled:cursor-not-allowed';

const footerConfirmBtn =
  'text-[9px] font-bold px-3 py-1.5 rounded font-[var(--font-title)] tracking-[0.08em] transition-all disabled:opacity-40 disabled:cursor-not-allowed ' +
  'bg-gradient-to-r from-[oklch(0.74_0.17_85)] to-[oklch(0.68_0.22_60)] text-[var(--on-mint)] shadow-[0_0_12px_oklch(0.74_0.17_85_/_0.3)] hover:shadow-[0_0_18px_oklch(0.74_0.17_85_/_0.5)]';

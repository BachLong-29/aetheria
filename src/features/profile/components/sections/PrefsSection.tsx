'use client';

import { PrefRow } from './PrefRow';
import type { ProfileFormData } from '@/types/profile';

interface Props {
  form: ProfileFormData;
  onChange: <K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) => void;
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-[3px] bg-bg-2 border border-border rounded-xs p-[2px]">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-7 h-7 bg-transparent border-none text-text-md hover:text-gold [font-family:var(--f-title)] text-[16px] cursor-pointer transition-colors"
      >
        −
      </button>
      <span className="w-7 text-center [font-family:var(--f-title)] italic text-[16px] text-text-hi">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-7 h-7 bg-transparent border-none text-text-md hover:text-gold [font-family:var(--f-title)] text-[16px] cursor-pointer transition-colors"
      >
        +
      </button>
    </div>
  );
}

export function PrefsSection({ form, onChange }: Props) {
  return (
    <div>
      <PrefRow
        label="Daily working hours"
        hint="How many hours you plan to work each day (used for capacity planning)."
      >
        <div className="flex items-center gap-2">
          <Stepper
            value={Math.round(form.dailyCapacityMinutes / 60)}
            onChange={(h) => onChange('dailyCapacityMinutes', Math.min(1440, Math.max(60, h * 60)))}
            min={1}
            max={24}
          />
          <span className="[font-family:var(--f-mono)] text-[10px] tracking-[0.12em] uppercase text-text-lo">
            h / day
          </span>
        </div>
      </PrefRow>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/libs/utils';

export interface SectionDef {
  id: string;
  label: string;
  glyph: string;
  subtitle: string;
}

export const PROFILE_SECTIONS: SectionDef[] = [
  { id: 'identity', label: 'Identity', glyph: 'I', subtitle: 'Name · title · monogram' },
  { id: 'class', label: 'Class & Path', glyph: 'II', subtitle: 'Choose how you progress' },
  { id: 'companion', label: 'Companion', glyph: 'III', subtitle: 'Pick your travelling spirit' },
  { id: 'theme', label: 'Theme & Sigil', glyph: 'IV', subtitle: 'Colour of your light' },
  { id: 'stats', label: 'Attributes', glyph: 'V', subtitle: 'Allocate your points' },
  { id: 'focus', label: 'Focus Categories', glyph: 'VI', subtitle: 'What quests you draw' },
  { id: 'badges', label: 'Showcase', glyph: 'VII', subtitle: 'Up to four worn badges' },
  { id: 'prefs', label: 'Quest Behaviour', glyph: 'VIII', subtitle: 'Cadence and difficulty' },
  { id: 'cash-log', label: 'Cash Reminder', glyph: 'IX', subtitle: 'Log what you spent in cash' },
  { id: 'appearance', label: 'Appearance', glyph: 'X', subtitle: 'Light, dark or system' },
];

interface Props {
  active: string;
  onPick: (id: string) => void;
  lastSaved?: string | null;
  /** The form differs from what the server holds. */
  dirty?: boolean;
}

export function ProfileSectionNav({ active, onPick, lastSaved, dirty }: Props) {
  const t = useTranslations('profile.status');
  const navCls = cn('flex flex-col h-full', 'px-7 py-7 border-r border-border-lo');

  return (
    <nav
      className={navCls}
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--panel) 70%, transparent), color-mix(in oklab, var(--panel) 85%, transparent))',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="[font-family:var(--f-mono)] text-[9px] tracking-[0.32em] uppercase text-text-lo">
        EDITING CHAMBER
      </div>
      <h2 className="[font-family:var(--f-title)] italic font-medium text-[28px] leading-none mt-[6px] mb-[2px]">
        Hero Identity
      </h2>
      <div className="[font-family:var(--f-title)] italic text-[13px] text-text-lo mb-5 leading-snug">
        Shape your character. The world reacts as you write.
      </div>

      <ol className="list-none m-0 p-0 flex flex-col gap-[2px] flex-1">
        {PROFILE_SECTIONS.map((s) => {
          const isActive = active === s.id;
          const itemCls = cn(
            'flex gap-[14px] items-center px-3 py-[10px] cursor-pointer rounded-xs',
            'border-l-2 transition-all duration-[160ms]',
            isActive ? 'bg-bg-3 border-l-gold' : 'border-l-transparent hover:bg-bg-2',
          );
          return (
            <li key={s.id} className={itemCls} onClick={() => onPick(s.id)}>
              <span className="[font-family:var(--f-title)] italic text-gold w-7 flex-shrink-0 text-center text-[13px]">
                {s.glyph}
              </span>
              <div className="min-w-0">
                <div className="[font-family:var(--f-title)] italic text-[14px] text-text-hi truncate">
                  {s.label}
                </div>
                <div className="[font-family:var(--f-mono)] text-[8px] tracking-[0.14em] uppercase text-text-lo mt-[2px] truncate">
                  {s.subtitle}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="pt-4 border-t border-border-lo flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="[font-family:var(--f-body)] text-[11px] tracking-[0.04em] text-text-md hover:text-gold transition-colors no-underline"
        >
          ← Dashboard
        </Link>
        <div className="[font-family:var(--f-mono)] text-[8px] tracking-[0.14em] uppercase text-text-lo">
          {dirty ? t('unsaved') : lastSaved ? t('saved', { time: lastSaved }) : t('clean')}
        </div>
      </div>
    </nav>
  );
}

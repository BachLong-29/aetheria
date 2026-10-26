'use client';

import type { ReactNode, ChangeEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn, matchesQuery } from '@/libs/utils';

export interface CommandItem {
  key: string;
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandGroup {
  label?: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
  className?: string;
  /** Controlled input value. When provided, pair with `onQueryChange`. */
  query?: string;
  /** Fires on every input change (controlled mode). */
  onQueryChange?: (value: string) => void;
  /** Skip the built-in `label.includes` filter — items are already filtered (e.g. server-side). */
  disableFilter?: boolean;
  /** Show a loading row instead of "no results" while results are being fetched. */
  loading?: boolean;
  /** Text shown when there are no results. */
  emptyLabel?: string;
}

export function CommandPalette({
  open,
  onClose,
  groups,
  placeholder,
  className,
  query: queryProp,
  onQueryChange,
  disableFilter = false,
  loading = false,
  emptyLabel,
}: CommandPaletteProps) {
  const t = useTranslations('common');
  const [innerQuery, setInnerQuery] = useState('');
  const isControlled = queryProp !== undefined;
  const query = isControlled ? queryProp : innerQuery;

  const setQuery = (value: string) => {
    if (!isControlled) setInnerQuery(value);
    onQueryChange?.(value);
  };

  // User's explicit arrow/hover choice; null = follow the first result.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const allItems = groups.flatMap((g) => g.items);

  const filtered =
    !disableFilter && query.trim()
      ? allItems.filter((item) => matchesQuery(item.label, query))
      : allItems;

  const filteredGroups: CommandGroup[] =
    !disableFilter && query.trim() ? [{ items: filtered }] : groups;

  // Effective highlight: the explicit selection if still present, else the first item.
  const focusedKey =
    selectedKey && filtered.some((it) => it.key === selectedKey)
      ? selectedKey
      : (filtered[0]?.key ?? null);

  const handleClose = useCallback(() => {
    if (!isControlled) setInnerQuery('');
    setSelectedKey(null);
    onClose();
  }, [isControlled, onClose]);

  // Focus the input when the palette opens (DOM sync, no React state here).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, handleClose]);

  // Keep the highlighted item in view when arrow keys move past the visible scroll area.
  useEffect(() => {
    if (!open || !focusedKey) return;
    itemRefs.current.get(focusedKey)?.scrollIntoView({ block: 'nearest' });
  }, [open, focusedKey]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((it) => it.key === focusedKey);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filtered[(idx + 1) % filtered.length];
      if (next) setSelectedKey(next.key);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
      if (prev) setSelectedKey(prev.key);
    } else if (e.key === 'Enter') {
      // Without this, the same Enter keypress that selects an item can be read as an
      // implicit form-submit by whatever the selection focuses next (e.g. TransactionFormModal's
      // auto-focused amount field opens inside a <form> right as this event is still resolving),
      // submitting it before the user ever pressed Enter a second time.
      e.preventDefault();
      const item = filtered[idx];
      if (item) {
        item.onSelect();
        handleClose();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-start justify-center pt-24 px-4"
      style={{ background: 'oklch(0.03 0.02 270 / 0.7)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className={cn(
          'w-full max-w-[540px] rounded-[var(--r-lg)] overflow-hidden',
          'border border-[var(--gold)] shadow-[var(--sh-4),var(--sh-glow-gold)]',
          className,
        )}
        style={{ background: 'var(--bg-1)' }}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-lo)]">
          <span className="text-[16px] text-[var(--gold)] shrink-0">⌕</span>
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder ?? t('commandPalette.placeholder')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setSelectedKey(null);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-[var(--text-hi)] text-[18px] placeholder:text-[var(--text-dim)]"
          />
          <span className="font-[var(--f-mono)] text-[9px] tracking-[0.1em] text-[var(--text-md)] bg-[var(--bg-3)] border border-b-2 border-[var(--border)] rounded-[3px] px-1.5 py-0.5 shrink-0">
            ESC
          </span>
        </div>

        <div className="p-1 max-h-80 overflow-y-auto">
          {filteredGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="[font-family:var(--f-title)] text-[9px] tracking-[0.25em] uppercase text-[var(--text-dim)] px-3 pt-3 pb-1">
                  {group.label}
                </div>
              )}
              {group.items
                .filter((item) => filtered.some((f) => f.key === item.key))
                .map((item) => {
                  const focused = item.key === focusedKey;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      ref={(node) => {
                        itemRefs.current.set(item.key, node);
                      }}
                      onMouseEnter={() => setSelectedKey(item.key)}
                      onClick={() => {
                        item.onSelect();
                        handleClose();
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-[var(--r-sm)]',
                        'text-[13px] cursor-pointer text-left transition-colors duration-100',
                        focused ? 'text-[var(--gold)]' : 'text-[var(--text-md)]',
                      )}
                      style={
                        focused
                          ? {
                              background:
                                'linear-gradient(90deg, oklch(0.78 0.16 82 / 0.15), transparent)',
                            }
                          : undefined
                      }
                    >
                      {item.icon && (
                        <span className="text-[14px] opacity-80 shrink-0">{item.icon}</span>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <span className="font-[var(--f-mono)] text-[9px] text-[var(--text-dim)] tracking-[0.1em] shrink-0">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}

          {loading && filtered.length === 0 && (
            <div className="text-center py-6 text-[var(--text-lo)] text-[13px]">
              {t('commandPalette.searching')}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-6 text-[var(--text-lo)] text-[13px]">
              {emptyLabel ?? t('commandPalette.noResults', { query })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

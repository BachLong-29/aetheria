'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';
import { SkelBlock } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { useCalendar } from '@/features/schedule/hooks/useCalendar';

import { DownloadImageButton } from './DownloadImageButton';
import { todayISO, toLocalDate } from '@/features/tasks/utils/date.utils';
import { apiClient } from '@/libs/axios';
import { useUIStore } from '@/stores/ui.store';

import { ogMaxRows } from '../constants/og-palette';
import { buildAgendaText, countTally } from '../utils/agenda-text';

type Scope = 'day' | 'week';

/** Monday of the week containing `date` — the week the schedule views use. */
function weekStartOf(date: Date): Date {
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

export function ShareAgendaModal() {
  const t = useTranslations('share');
  const locale = useLocale();
  const open = useUIStore((s) => s.shareAgendaOpen);
  const close = useUIStore((s) => s.closeShareAgenda);
  const addToast = useUIStore((s) => s.addToast);

  const [scope, setScope] = useState<Scope>('day');
  const [downloading, setDownloading] = useState(false);

  // Always the current day or week — the share never follows whichever week the
  // schedule happens to be scrolled to.
  const { from, to } = useMemo(() => {
    if (scope === 'day') return { from: todayISO(), to: todayISO() };
    const start = weekStartOf(new Date());
    return { from: toLocalDate(start), to: toLocalDate(addDays(start, 6)) };
  }, [scope]);

  const { data: items = [], isLoading, isError, refetch } = useCalendar(from, to, open);

  const heading = useMemo(() => {
    if (scope === 'day') {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${from}T00:00:00`));
    }
    const range = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    return `${range.format(new Date(`${from}T00:00:00`))} – ${range.format(new Date(`${to}T00:00:00`))}`;
  }, [scope, from, to, locale]);

  const tally = countTally(items);
  const summaryLabel = tally.total > 0 ? t('summary', tally) : undefined;
  const emptyLabel = scope === 'day' ? t('emptyDay') : t('emptyWeek');

  const text = useMemo(
    () => buildAgendaText({ items, scope, locale, heading, emptyLabel, summaryLabel }),
    [items, scope, locale, heading, emptyLabel, summaryLabel],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: t('copied') });
    } catch {
      // Clipboard is blocked outside a secure context or without permission.
      addToast({ type: 'error', message: t('copyFailed') });
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      // Every word on the card is worded here, where the active locale lives —
      // the route only lays them out.
      const params = new URLSearchParams({
        from,
        to,
        heading,
        emptyLabel,
        scopeLabel: scope === 'day' ? t('scopeDay') : t('scopeWeek'),
        locale,
      });
      if (summaryLabel) params.set('summaryLabel', summaryLabel);

      const overflow = items.length - ogMaxRows(scope);
      if (overflow > 0) params.set('moreLabel', t('more', { count: overflow }));

      const { data } = await apiClient.get<Blob>(`/share/agenda?${params}`, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agenda-${from}${scope === 'week' ? `_${to}` : ''}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast({ type: 'error', message: t('imageFailed') });
    } finally {
      setDownloading(false);
    }
  }

  return (
    // bottomSheet keeps this centred from `sm` up and docks it to the bottom
    // edge below that, where a sheet is the native shape for a panel like this.
    <Modal open={open} onClose={close} maxWidth="520px" scrollable bottomSheet>
      <ModalHead tag="SHARE" title={t('title')} />
      <ModalBody scrollable className="flex flex-col gap-3">
        <Tabs
          variant="pill"
          activeKey={scope}
          onChange={(key) => setScope(key as Scope)}
          tabs={[
            { key: 'day', label: t('scopeDay') },
            { key: 'week', label: t('scopeWeek') },
          ]}
        />

        {isLoading && <SkelBlock className="h-[220px] w-full" />}

        {isError && !isLoading && (
          <div className="flex flex-col items-start gap-2 py-4">
            <p className="text-[12px] text-[var(--rose)]">{t('loadFailed')}</p>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}

        {!isLoading && !isError && (
          <pre
            className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-2)] p-3 text-[12px] leading-relaxed text-[var(--text-hi)]"
            aria-label={t('previewAriaLabel')}
          >
            {text}
          </pre>
        )}
      </ModalBody>
      <ModalFoot>
        {/*
          Three tiers, strongest first: copying is what most shares end in,
          downloading is the other real action, closing is the way out. Close
          and download used to share the ghost variant, which made the exit
          look like an action.
        */}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="primary"
            onClick={handleCopy}
            disabled={isLoading || isError}
            className="w-full justify-center sm:w-auto"
          >
            {t('copyText')}
          </Button>
          <DownloadImageButton
            label={t('downloadImage')}
            onDownload={handleDownload}
            downloading={downloading}
            disabled={isLoading || isError}
          />
          <Button
            variant="ghost"
            onClick={close}
            className="w-full justify-center sm:w-auto"
            disabled={downloading}
          >
            {t('close')}
          </Button>
        </div>
      </ModalFoot>
    </Modal>
  );
}

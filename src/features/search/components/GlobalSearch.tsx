'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CommandPalette, type CommandGroup } from '@/components/ui/CommandPalette';
import { EditTaskModal } from '@/features/tasks/components/shared/EditTaskModal';
import { taskToUITask } from '@/features/tasks/data/adapters';
import { useTaskById } from '@/features/dashboard/hooks/useTaskById';
import { useUpdateTask } from '@/features/dashboard/hooks/useUpdateTask';
import { useRouter } from '@/i18n/navigation';
import { useDebounce } from '@/hooks/useDebounce';
import { useUIStore } from '@/stores/ui.store';
import type { GlobalSearchResult, SearchHit, UpdateTaskPayload } from '@/types';

import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { matchesQuery } from '@/libs/utils';

const GROUP_KEYS: (keyof GlobalSearchResult)[] = ['tasks', 'habits', 'quests', 'projects'];

export function GlobalSearch() {
  const open = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const router = useRouter();
  const t = useTranslations('search');
  const tNav = useTranslations('nav');
  const tDash = useTranslations('dashboard');
  const tFinance = useTranslations('finance');

  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);
  const { result, isLoading } = useGlobalSearch(open ? debounced : '');

  // Picking a task hit edits it in place instead of navigating to /tasks —
  // the modal renders from the protected layout, so it works on any page.
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const { data: editTask } = useTaskById(editTaskId);
  const updateTask = useUpdateTask();

  // Ctrl/Cmd + K toggles the palette anywhere in the protected app.
  // Read the latest store state at fire time so the listener can stay deps-free,
  // and reset the query on every close path (incl. keyboard) for a fresh reopen.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const store = useUIStore.getState();
        if (store.searchOpen) {
          setQuery('');
          store.closeSearch();
        } else {
          store.openSearch();
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  const handleClose = () => {
    setQuery('');
    closeSearch();
  };

  const select = (hit: SearchHit) => {
    handleClose();
    if (hit.type === 'task') {
      setEditTaskId(hit.id);
      return;
    }
    router.push(hit.href);
  };

  const handleSaveTask = (id: string, payload: UpdateTaskPayload, onSuccess: () => void) => {
    updateTask.mutate(
      { id, ...payload },
      {
        onSuccess: () => {
          setEditTaskId(null);
          onSuccess();
        },
      },
    );
  };

  // Static app routes — searched/filtered client-side, matched on label or keywords.
  const pages = useMemo<{ href: string; icon: string; label: string; keywords?: string[] }[]>(
    () => [
      { href: '/dashboard', icon: '🏠', label: tNav('dashboard') },
      { href: '/tasks', icon: '📋', label: tDash('questLog'), keywords: ['tasks', 'todo'] },
      { href: '/projects', icon: '🚀', label: tNav('projects') },
      { href: '/marketplace', icon: '🛍', label: tNav('marketplace'), keywords: ['shop', 'store'] },
      { href: '/achievements', icon: '🏆', label: t('pageNames.achievements') },
      { href: '/manage/rewards', icon: '🎁', label: t('pageNames.rewards') },
      {
        href: '/manage/events',
        icon: '📅',
        label: t('pageNames.events'),
        keywords: ['event', 'events', 'meeting', 'calendar'],
      },
      { href: '/profile', icon: '✦', label: tNav('profile') },
      { href: '/finance', icon: '💰', label: tNav('finance') },
      {
        href: '/finance/wallets',
        icon: '🏦',
        label: `${tNav('finance')} · ${tFinance('tabs.accounts')}`,
        keywords: ['wallet', 'wallets', 'bank', 'account'],
      },
      {
        href: '/finance/budget',
        icon: '🧾',
        label: `${tNav('finance')} · ${tFinance('tabs.budget')}`,
      },
      {
        href: '/finance/goals',
        icon: '🎯',
        label: `${tNav('finance')} · ${tFinance('tabs.goals')}`,
        keywords: ['savings'],
      },
      {
        href: '/finance/transactions',
        icon: '📄',
        label: `${tNav('finance')} · ${tFinance('tabs.transactions')}`,
        keywords: ['ledger', 'history'],
      },
      {
        href: '/finance/categories',
        icon: '🏷',
        label: `${tNav('finance')} · ${tFinance('tabs.categories')}`,
      },
    ],
    [t, tNav, tDash, tFinance],
  );

  const groups: CommandGroup[] = useMemo(() => {
    const apiGroups = GROUP_KEYS.map((key) => ({
      label: t(key),
      items: result[key].map((hit) => ({
        key: `${hit.type}:${hit.id}`,
        icon: hit.icon,
        label: hit.label,
        onSelect: () => select(hit),
      })),
    })).filter((g) => g.items.length > 0);

    const q = debounced.trim();
    const pageItems = q
      ? pages
          .filter((p) => matchesQuery(p.label, q) || p.keywords?.some((k) => matchesQuery(k, q)))
          .map((p) => ({
            key: `page:${p.href}`,
            icon: p.icon,
            label: p.label,
            onSelect: () => {
              handleClose();
              router.push(p.href);
            },
          }))
      : [];

    const groups =
      pageItems.length > 0
        ? [...apiGroups, { label: t('pagesLabel'), items: pageItems }]
        : apiGroups;

    // Whatever was typed can also go to the assistant as a message. Built from
    // the live query, not the debounced one, so it never sends a stale half.
    const typed = query.trim();
    if (!typed) return groups;
    return [
      ...groups,
      {
        label: t('askAssistant.group'),
        items: [
          {
            key: 'assistant:ask',
            icon: '✨',
            label: t('askAssistant.label', { query: typed }),
            onSelect: () => {
              useUIStore.getState().setPendingAssistantPrompt(typed);
              handleClose();
              router.push('/assistant');
            },
          },
        ],
      },
    ];
    // select/router/handleClose are stable enough; recompute only when results/pages/query change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, t, pages, debounced, query]);

  const emptyLabel = debounced.trim() ? t('empty', { query: debounced.trim() }) : t('hint');

  return (
    <>
      <CommandPalette
        open={open}
        onClose={handleClose}
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        disableFilter
        loading={isLoading}
        emptyLabel={emptyLabel}
        placeholder={t('placeholder')}
      />

      {/*
        Mounted even with nothing to edit. EditTaskModal keeps its follow-up
        dialogs — the session planner, the "your sessions moved" prompt — in its
        own state, and raises them after a save has cleared the task. Rendering
        it conditionally tore it down in the same breath, so those never showed.
      */}
      <EditTaskModal
        task={editTask ? taskToUITask(editTask) : null}
        open={!!editTaskId && !!editTask}
        onClose={() => setEditTaskId(null)}
        onSave={handleSaveTask}
        saving={updateTask.isPending}
      />
    </>
  );
}

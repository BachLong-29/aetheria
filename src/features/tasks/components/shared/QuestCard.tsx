'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

import { useTranslations } from 'next-intl';

import { cn } from '@/libs/utils';

import { ProjectBadge } from '@/components/common/ProjectBadge';
import { SessionPlanner, type PlannerTask } from '@/features/schedule/components/SessionPlanner';
import { useTaskBlocks } from '@/features/schedule/hooks/useScheduleBlocks';
import { useOnClickOutside } from '@/hooks';

import { catOf, fmtEst, COLOR_VAR, type UITask } from '../../data/mock';
import { qcxBtnGhost, qcxBtnPrimary } from './styles';
import { Icon } from '@/components/common/Icon';
import { ImageLightbox } from '@/components/common/ImageLightbox';

// ─── Session helpers ────────────────────────────────────────────────────────────

function fmtSessionDate(d: string): string {
  const p = d.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function sessionEndTime(start: string, dur: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h ?? 0) * 60 + (m ?? 0) + dur);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmtSessionDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuestCardProps {
  task: UITask;
  expanded?: boolean;
  onExpand?: () => void;
  onToggleDone?: (id: string) => void;
  onReschedule?: (task: UITask) => void;
  onCompleteTask?: (id: string) => void;
  onEdit?: (task: UITask) => void;
  onClone?: (task: UITask) => void;
  onMoveToNextDay?: (task: UITask) => void;
  /** Quests cannot be edited, so deleting is the only way to undo a mistake. */
  onDeleteQuest?: (task: UITask) => void;
  isOverlay?: boolean;
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestCard({
  task,
  expanded,
  onExpand,
  onToggleDone,
  onReschedule,
  onCompleteTask,
  onEdit,
  onClone,
  onMoveToNextDay,
  onDeleteQuest,
  isOverlay,
  compact,
}: QuestCardProps) {
  const t = useTranslations('tasks');
  const c = catOf(task.cat);
  const catColor = COLOR_VAR[c.color] ?? 'var(--text-lo)';

  // For habits the title is "${icon} ${name}" — show icon in its own column
  // and strip it from the label to avoid duplication.
  const titleDisplay =
    task.icon && task.title.startsWith(task.icon)
      ? task.title.slice(task.icon.length).trim()
      : task.title;

  // Quick actions shared between the desktop hover row and the mobile "⋯" menu
  // (hover never fires on touch, so mobile needs a tappable equivalent).
  const canMoveToNextDay =
    !!onMoveToNextDay && !task.done && !task.cancelled && task.source !== 'habit';
  const canClone = !!onClone && task.source === 'task';
  const canEdit = !!onEdit && (task.source === 'task' || task.source === 'habit');
  const canDeleteQuest = !!onDeleteQuest && task.source === 'quest';
  const hasQuickActions = canMoveToNextDay || canClone || canEdit || canDeleteQuest;

  // A saga or a moved habit keeps its own look; every other card takes the quest's colour.
  const plainCard = !task.saga && !task.cancelled;

  // "13:30 · 1h": when it starts and how long it takes, above the title.
  const timeLine = [task.startTime, task.est > 0 ? fmtEst(task.est) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={cn(
        cardBase,
        task.done && cardDone,
        task.saga && cardSaga,
        task.cancelled && cardCancelled,
        isOverlay && 'shadow-[0_8px_32px_oklch(0_0_0_/_0.5)] scale-[1.02] cursor-grabbing',
        'group',
      )}
      style={plainCard ? tint(catColor) : undefined}
    >
      {/* ── Collapsed main row ────────────────────────────────────────────────── */}
      <div
        className="flex w-full cursor-pointer items-center gap-3"
        onClick={!isOverlay ? onExpand : undefined}
      >
        {/* The icon leads the row: it is what the eye scans for. */}
        {task.icon && (
          <span
            className="flex w-[30px] shrink-0 items-center justify-center text-[26px] leading-none select-none"
            style={{ color: catColor }}
          >
            <Icon icon={task.icon} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {timeLine && (
            <div
              className={cn(
                'mb-1 truncate text-[11px] leading-none tabular-nums text-[var(--text-mid)]',
                task.done && 'text-[var(--mint)]',
              )}
            >
              {timeLine}
            </div>
          )}

          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                titleText,
                task.done && !task.isMultiDay && 'line-through text-[var(--text-lo)]',
                task.cancelled && 'line-through text-[var(--text-lo)]',
              )}
            >
              {titleDisplay}
            </span>

            {/* Inline status badge */}
            {task.cancelled ? (
              <span
                className={cn(inlineBadge, 'border-[oklch(0.72_0.18_5_/_0.3)] text-[var(--rose)]')}
              >
                MOVED
              </span>
            ) : task.isMultiDay ? (
              <span
                className={cn(
                  inlineBadge,
                  'transition-colors',
                  task.loggedToday
                    ? 'border-[oklch(0.76_0.16_205_/_0.4)] text-[var(--cyan)]'
                    : 'border-[var(--border)] text-[var(--text-lo)]',
                )}
              >
                {task.loggedToday ? '✓' : `${task.totalDays}D`}
              </span>
            ) : null}

            {task.overdueLevel &&
              task.overdueLevel !== 'failed' &&
              !task.done &&
              !task.cancelled &&
              (task.overdueLevel === 'critical' ? (
                <span className="text-[9px] font-bold px-1 py-px rounded border tracking-[0.06em] font-[var(--font-title)] bg-[oklch(0.72_0.18_5_/_0.12)] border-[oklch(0.72_0.18_5_/_0.3)] text-[var(--rose)] animate-pulse">
                  !
                </span>
              ) : (
                <span className="text-[9px] font-bold px-1 py-px rounded border tracking-[0.06em] font-[var(--font-title)] bg-[oklch(0.74_0.17_85_/_0.1)] border-[oklch(0.74_0.17_85_/_0.3)] text-[var(--gold)]">
                  ⚠
                </span>
              ))}
          </div>
        </div>

        {/* Quick actions. Desktop reveals them on hover; mobile has no hover, so its menu
            stays — it is also the only place a quest can be deleted from a phone. The rest of
            the details (rank, reward, note, actions) sit in the panel the card opens. */}
        {!isOverlay && (
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Desktop: hover-reveal quick actions (hover doesn't exist on touch) */}
            <div className="hidden items-center gap-0.5 sm:group-hover:flex">
              {canMoveToNextDay && (
                <button
                  type="button"
                  title="Move to next day"
                  className={actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToNextDay?.(task);
                  }}
                >
                  →
                </button>
              )}
              {canClone && (
                <button
                  type="button"
                  title="Clone task"
                  className={actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClone?.(task);
                  }}
                >
                  ⧉
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  title={task.source === 'habit' ? 'Go to Habits' : 'Edit'}
                  className={actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(task);
                  }}
                >
                  {task.source === 'habit' ? '↗' : '✎'}
                </button>
              )}
              {canDeleteQuest && (
                <button
                  type="button"
                  title={t('questCard.deleteQuest')}
                  className={cn(actionBtn, 'text-[var(--rose)]')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteQuest?.(task);
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Mobile: always-visible "more actions" menu */}
            {hasQuickActions && (
              <QuestCardActionsMenu
                t={t}
                task={task}
                canMoveToNextDay={canMoveToNextDay}
                canClone={canClone}
                canEdit={canEdit}
                canDeleteQuest={canDeleteQuest}
                onDeleteQuest={onDeleteQuest}
                onMoveToNextDay={onMoveToNextDay}
                onClone={onClone}
                onEdit={onEdit}
              />
            )}
          </div>
        )}

        {/* The state closes the row, so a check never reads as its subject. */}
        <button
          type="button"
          className={cn(
            checkBtn,
            !task.isMultiDay && task.done && checkBtnDone,
            task.isMultiDay && task.loggedToday && checkBtnLogged,
          )}
          style={
            (task.isMultiDay ? task.loggedToday : task.done)
              ? undefined
              : { borderColor: `color-mix(in oklab, ${catColor} 60%, transparent)` }
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone?.(task.id);
          }}
          aria-label={task.isMultiDay ? 'Log today' : 'Toggle complete'}
        >
          {task.isMultiDay ? (task.loggedToday ? '✓' : '') : task.done ? '✓' : ''}
        </button>
      </div>

      {/* ── Expanded detail panel ─────────────────────────────────────────────── */}
      {expanded && !compact && (
        <ExpandedPanel
          task={task}
          catColor={catColor}
          onToggleDone={onToggleDone}
          onReschedule={onReschedule}
          onCompleteTask={onCompleteTask}
          onEdit={onEdit}
          onClone={onClone}
          onMoveToNextDay={onMoveToNextDay}
        />
      )}
    </article>
  );
}

// ─── Expanded panel ───────────────────────────────────────────────────────────

function ExpandedPanel({
  task,
  catColor,
  onToggleDone,
  onReschedule,
  onCompleteTask,
  onEdit,
  onClone,
  onMoveToNextDay,
}: {
  task: UITask;
  catColor: string;
  onToggleDone?: (id: string) => void;
  onReschedule?: (task: UITask) => void;
  onCompleteTask?: (id: string) => void;
  onEdit?: (task: UITask) => void;
  onClone?: (task: UITask) => void;
  onMoveToNextDay?: (task: UITask) => void;
}) {
  const t = useTranslations('tasks');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  // Only one card is expanded at a time, so the planner lives here rather than
  // being threaded down four levels from the page that owns the day view.
  const plannerTask: PlannerTask | null =
    task.sourceId && task.startDate
      ? {
          id: task.sourceId,
          name: task.title,
          icon: task.icon,
          color: task.color,
          duration: task.est,
          startDate: task.startDate,
          endDate: task.endDate,
        }
      : null;

  // Scheduled work sessions — only tasks carry schedule blocks.
  const { data: sessions = [] } = useTaskBlocks(task.source === 'task' ? task.sourceId : undefined);
  const sortedSessions = [...sessions].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  const attachments = task.attachments ?? [];

  return (
    <div className="w-full mt-2 pt-2.5 border-t border-[var(--border)] pl-[26px]">
      {/* Detail grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Rank', value: task.diff },
          { label: 'Est.', value: fmtEst(task.est) },
          task.isMultiDay
            ? { label: 'Duration', value: `${task.totalDays} days` }
            : { label: 'Deadline', value: task.deadline },
          { label: 'Reward', value: `${task.xp} XP · ${task.coins} ◎` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-[2px]">
            <div className="text-[8px] text-[var(--text-lo)] tracking-[0.1em] uppercase">
              {label}
            </div>
            <div className="text-[10px] text-[var(--text-hi)] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {/* Project badge */}
      {task.projectName && (
        <div className="mb-2">
          <ProjectBadge name={task.projectName} icon={task.projectIcon} color={task.projectColor} />
        </div>
      )}

      {/* Sage's note — expandedNote is demo/lore flavor text; real tasks carry their
          full note in desc (the collapsed row only shows its first line). */}
      {(task.expandedNote || task.desc) && (
        <div className="mb-3 p-2 bg-[oklch(0.66_0.22_295_/_0.06)] border border-[oklch(0.66_0.22_295_/_0.2)] rounded-[var(--r-sm)]">
          <div className="text-[8px] tracking-[0.12em] text-[var(--violet)] font-bold mb-1">
            SAGE&apos;S NOTE
          </div>
          <div className="text-[10px] text-[var(--text-mid)] leading-[1.5] whitespace-pre-line">
            {task.expandedNote ?? task.desc}
          </div>
        </div>
      )}

      {/* Scheduled sessions */}
      {sortedSessions.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[8px] tracking-[0.12em] text-[var(--text-lo)] font-bold uppercase font-[var(--font-title)]">
              🗓 Đã lên lịch ({sortedSessions.length})
            </span>
            {plannerTask && (
              <button
                type="button"
                className={cn(
                  'ml-auto flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5',
                  'border border-[var(--border)] text-[8px] font-bold tracking-[0.1em] uppercase',
                  'text-[var(--text-lo)] transition-colors',
                  'hover:border-[var(--gold)] hover:text-[var(--gold)]',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setPlanning(true);
                }}
                title={t('questCard.editSessions')}
                aria-label={t('questCard.editSessions')}
              >
                ✎ {t('questCard.editSessions')}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {sortedSessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 rounded-[var(--r-sm)] border bg-[var(--panel2)]',
                  s.status === 'done'
                    ? 'border-[oklch(0.76_0.14_162_/_0.35)]'
                    : s.status === 'missed'
                      ? 'border-[oklch(0.72_0.18_5_/_0.35)]'
                      : 'border-[var(--border)]',
                )}
              >
                <span className="text-[9px] text-[var(--text-hi)] font-semibold w-[88px] shrink-0">
                  {fmtSessionDate(s.date)}
                </span>
                <span className="text-[9px] text-[var(--text-mid)] tabular-nums">
                  {s.startTime}–{sessionEndTime(s.startTime, s.duration)}
                </span>
                <span className="text-[9px] text-[var(--text-lo)] ml-auto tabular-nums">
                  {fmtSessionDur(s.duration)}
                </span>
                {s.status === 'done' && (
                  <span className="text-[9px] text-[var(--mint)]" title="Đã xong">
                    ✓
                  </span>
                )}
                {s.status === 'missed' && (
                  <span className="text-[9px] text-[var(--rose)]" title="Đã lỡ">
                    ✕
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mb-3">
          <div className="text-[8px] tracking-[0.12em] text-[var(--text-lo)] font-bold uppercase mb-1.5 font-[var(--font-title)]">
            📎 Đính kèm ({attachments.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((url) => (
              <button
                key={url}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(url);
                }}
                className="relative w-[56px] h-[56px] rounded-[var(--r-sm)] overflow-hidden border border-[var(--border)] hover:border-[oklch(0.74_0.17_85_/_0.5)] transition-colors cursor-zoom-in shrink-0"
                title="Xem ảnh"
              >
                <Image src={url} alt="Attachment" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox — full-screen image viewer */}
      {lightbox && (
        <ImageLightbox src={lightbox} closeLabel="Đóng" onClose={() => setLightbox(null)} />
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-[var(--text-lo)]">Progress</span>
          <span className="text-[9px] text-[var(--text-mid)]">
            {Math.round((task.progress || 0) * 100)}%
          </span>
        </div>
        <div className="h-[4px] bg-[var(--panel2)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(task.progress || 0) * 100}%`,
              background: `linear-gradient(to right, ${catColor}, var(--violet))`,
            }}
          />
        </div>
      </div>

      {/* Sub-task progress */}
      {task.subtasks > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="flex-1 h-[3px] bg-[var(--panel2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--violet)] rounded-full"
              style={{ width: `${(task.subtasksDone / task.subtasks) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-[var(--text-lo)] shrink-0">
            {task.subtasksDone}/{task.subtasks} subtasks
          </span>
        </div>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="text-[8px] text-[var(--text-lo)] bg-[var(--panel2)] border border-[var(--border)] px-1 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {!task.cancelled && (
        <div className="flex gap-2 flex-wrap">
          {task.isMultiDay ? (
            <>
              <button
                type="button"
                className={task.loggedToday ? qcxBtnGhost : qcxBtnPrimary}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDone?.(task.id);
                }}
              >
                {task.loggedToday ? '✓ Today logged' : '◉ Log today'}
              </button>
              {task.status !== 'done' && onCompleteTask && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCompleteTask(task.id);
                  }}
                >
                  ✦ Mark Complete
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                >
                  ✎ Edit
                </button>
              )}
              {onClone && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClone(task);
                  }}
                >
                  ⧉ Clone
                </button>
              )}
            </>
          ) : (
            <>
              {task.source === 'task' && onEdit && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                >
                  ✎ Edit
                </button>
              )}
              {task.source === 'task' && onClone && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClone(task);
                  }}
                >
                  ⧉ Clone
                </button>
              )}
              {task.source === 'habit' && onEdit && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                >
                  ↗ Habits tab
                </button>
              )}
              {task.source === 'habit' && onReschedule && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReschedule(task);
                  }}
                >
                  ⏱ Reschedule
                </button>
              )}
              {onMoveToNextDay && !task.done && task.source !== 'habit' && (
                <button
                  type="button"
                  className={qcxBtnGhost}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToNextDay(task);
                  }}
                >
                  → Next day
                </button>
              )}
            </>
          )}
        </div>
      )}

      {task.cancelled && (
        <p className="text-[8px] text-[var(--rose)] opacity-70 italic">
          Rescheduled — original slot cancelled
        </p>
      )}

      <SessionPlanner
        open={planning && plannerTask !== null}
        task={plannerTask}
        onClose={() => setPlanning(false)}
      />
    </div>
  );
}

// ─── Mobile "more actions" menu ───────────────────────────────────────────────
// Desktop reveals quick actions on hover, but hover never fires on touch — this
// gives mobile a tappable, always-visible equivalent instead.

interface QuestCardActionsMenuProps {
  t: ReturnType<typeof useTranslations>;
  task: UITask;
  canMoveToNextDay: boolean;
  canClone: boolean;
  canEdit: boolean;
  canDeleteQuest: boolean;
  onDeleteQuest?: (task: UITask) => void;
  onMoveToNextDay?: (task: UITask) => void;
  onClone?: (task: UITask) => void;
  onEdit?: (task: UITask) => void;
}

function QuestCardActionsMenu({
  t,
  task,
  canMoveToNextDay,
  canClone,
  canEdit,
  canDeleteQuest,
  onDeleteQuest,
  onMoveToNextDay,
  onClone,
  onEdit,
}: QuestCardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  function select(action?: () => void) {
    setOpen(false);
    action?.();
  }

  return (
    <div ref={ref} className="relative flex sm:hidden">
      <button
        type="button"
        title={t('questCard.moreActions')}
        aria-label={t('questCard.moreActions')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={moreActionsBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>

      {open && (
        <div className={moreActionsMenu} role="menu" onClick={(e) => e.stopPropagation()}>
          {canMoveToNextDay && (
            <button
              type="button"
              role="menuitem"
              className={moreActionsItem}
              onClick={() => select(() => onMoveToNextDay?.(task))}
            >
              <span>→</span> {t('questCard.moveToNextDay')}
            </button>
          )}
          {canClone && (
            <button
              type="button"
              role="menuitem"
              className={moreActionsItem}
              onClick={() => select(() => onClone?.(task))}
            >
              <span>⧉</span> {t('questCard.cloneTask')}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              role="menuitem"
              className={moreActionsItem}
              onClick={() => select(() => onEdit?.(task))}
            >
              <span>{task.source === 'habit' ? '↗' : '✎'}</span>{' '}
              {task.source === 'habit' ? t('questCard.goToHabits') : t('questCard.edit')}
            </button>
          )}
          {canDeleteQuest && (
            <button
              type="button"
              role="menuitem"
              className={cn(moreActionsItem, 'text-[var(--rose)]')}
              onClick={() => select(() => onDeleteQuest?.(task))}
            >
              <span>✕</span> {t('questCard.deleteQuest')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const cardBase =
  'flex flex-col gap-0 px-3 py-3 bg-[var(--panel2)] border border-[var(--border)] rounded-[var(--r-lg,14px)] mb-2 cursor-grab hover:brightness-[0.97] transition-all duration-150 active:cursor-grabbing';

/** The card takes its quest's colour: a soft fill and edge, so colour tells rows apart. */
const tint = (color: string) => ({
  backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
  borderColor: `color-mix(in oklab, ${color} 28%, transparent)`,
});
const cardDone = 'opacity-50';
const cardSaga = 'border-[oklch(0.74_0.17_85_/_0.35)] bg-[oklch(0.74_0.17_85_/_0.04)]';
const cardCancelled =
  'opacity-40 border-dashed border-[oklch(0.72_0.18_5_/_0.35)] bg-[oklch(0.72_0.18_5_/_0.03)]';

const checkBtn =
  'w-[28px] h-[28px] rounded-full border-[1.5px] border-[var(--border)] flex items-center justify-center text-[14px] font-extrabold transition-all hover:border-[var(--mint)] shrink-0';
const checkBtnDone = 'bg-[var(--mint)] border-[var(--mint)] text-[var(--on-mint)]';
const checkBtnLogged = 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--on-mint)]';

const titleText =
  'text-[15px] font-bold text-[var(--text-hi)] leading-[1.25] truncate [font-family:var(--font-title)]';

const moreActionsBtn =
  'w-[26px] h-[26px] flex items-center justify-center text-[15px] leading-none text-[var(--text-lo)] rounded hover:text-[var(--text-hi)] hover:bg-[var(--panel3)] transition-colors cursor-pointer';
const moreActionsMenu =
  'absolute right-0 top-[calc(100%+4px)] z-30 min-w-[152px] flex flex-col gap-0.5 p-1 rounded-[var(--r-sm)] border border-[oklch(0.74_0.17_85_/_0.35)] bg-[var(--panel)] shadow-[0_8px_24px_oklch(0_0_0_/_0.45)]';
const moreActionsItem =
  'flex items-center gap-2 px-2.5 py-2 rounded-[var(--r-sm)] text-left text-[11px] whitespace-nowrap font-[var(--font-body)] text-[var(--text-mid)] border border-transparent cursor-pointer transition-all duration-150 hover:text-[var(--text-hi)] hover:bg-[oklch(0.74_0.17_85_/_0.08)] hover:border-[oklch(0.74_0.17_85_/_0.3)]';

const inlineBadge =
  'text-[7px] font-bold shrink-0 px-1 py-px rounded border tracking-[0.08em] font-[var(--font-title)]';

const actionBtn =
  'w-[18px] h-[18px] flex items-center justify-center text-[11px] text-[var(--text-lo)] rounded hover:text-[var(--text-hi)] hover:bg-[var(--panel3)] transition-colors cursor-pointer';

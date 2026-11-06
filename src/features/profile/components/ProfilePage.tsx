'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo, startTransition, type ReactNode } from 'react';
import { cn } from '@/libs/utils';
import { Button } from '@/components/ui';
import { useProfile } from '../hooks/useProfile';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { ProfileSectionNav } from './ProfileSectionNav';
import { HeroCard } from './HeroCard';
import { RevealModal, SuccessToast } from './RevealModal';
import { IdentitySection } from './sections/IdentitySection';
import { ClassSection } from './sections/ClassSection';
import { CompanionSection } from './sections/CompanionSection';
import { ThemeSection } from './sections/ThemeSection';
import { StatsSection } from './sections/StatsSection';
import { FocusSection } from './sections/FocusSection';
import { BadgesSection } from './sections/BadgesSection';
import { CashLogSection } from './sections/CashLogSection';
import { PrefsSection } from './sections/PrefsSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { useTheme } from '@/components/providers/ThemeProvider';
import { findAccent } from '@/constants/hero-data';
import { DEFAULT_PROFILE_FORM, mergeProfileToForm } from '@/types/profile';
import type { ProfileFormData } from '@/types/profile';

// ─── Section wrapper ──────────────────────────────────────────────────────────
function FormSection({
  id,
  num,
  label,
  subtitle,
  children,
}: {
  id: string;
  num: string;
  label: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section id={id} data-section={id} className="relative scroll-mt-8">
      <div className="flex gap-[18px] items-baseline mb-6 pb-4 border-b border-border-lo relative">
        <div
          className="absolute left-0 bottom-[-1px] w-20 h-px"
          style={{ background: 'linear-gradient(90deg, var(--gold), transparent)' }}
        />
        <div className="[font-family:var(--f-title)] italic font-medium text-[32px] text-gold w-14 flex-shrink-0">
          {num}
        </div>
        <div>
          <div className="[font-family:var(--f-mono)] text-[9px] tracking-[0.28em] uppercase text-text-lo">
            SECTION {num}
          </div>
          <h3 className="[font-family:var(--f-title)] italic font-medium text-[26px] leading-[1.1] my-1">
            {label}
          </h3>
          <div className="[font-family:var(--f-title)] italic text-[13px] text-text-lo">
            {subtitle}
          </div>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

// ─── Ambient background ───────────────────────────────────────────────────────
function AmbientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div
        className="absolute w-[900px] h-[500px] rounded-full"
        style={{
          filter: 'blur(80px)',
          mixBlendMode: 'screen',
          opacity: 0.3,
          background: 'radial-gradient(circle, oklch(60% 0.12 290/0.6), transparent 70%)',
          left: -200,
          top: 100,
          animation: 'drift-a 70s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute w-[900px] h-[500px] rounded-full"
        style={{
          filter: 'blur(80px)',
          mixBlendMode: 'screen',
          opacity: 0.25,
          background: 'radial-gradient(circle, oklch(60% 0.14 60/0.5), transparent 70%)',
          right: -200,
          top: 600,
          animation: 'drift-b 90s ease-in-out infinite alternate',
        }}
      />
      <style>{`
        @keyframes drift-a { to { transform: translate(160px, 80px); } }
        @keyframes drift-b { to { transform: translate(-120px, 140px); } }
      `}</style>
    </div>
  );
}

// ─── Mobile top-bar icons ─────────────────────────────────────────────────────
function BackIcon() {
  return (
    <svg
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 1 1 7l6 6M1 7h16" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor">
      <rect y="0" width="20" height="1.5" rx="1" />
      <rect y="6" width="20" height="1.5" rx="1" />
      <rect y="12" width="14" height="1.5" rx="1" />
    </svg>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────
export function ProfilePage() {
  const { data, isLoading } = useProfile();
  const updateMutation = useUpdateProfile();
  const { setTheme } = useTheme();
  const tStatus = useTranslations('profile.status');

  const [form, setForm] = useState<ProfileFormData>(DEFAULT_PROFILE_FORM);
  const [activeSection, setActiveSection] = useState('identity');
  const [revealing, setRevealing] = useState(false);
  const [toast, setToast] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // What the server holds, shown against the form to tell whether there is anything to save.
  const saved = useMemo(
    () => (data ? mergeProfileToForm(data.profile, data.settings) : DEFAULT_PROFILE_FORM),
    [data],
  );
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  // Populate form once data loads
  useEffect(() => {
    if (data) {
      startTransition(() => {
        setForm(mergeProfileToForm(data.profile, data.settings));
      });
    }
  }, [data]);

  // Scroll spy — update active section as user scrolls
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('[data-section]');
    if (!sections.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection((visible[0].target as HTMLElement).dataset.section ?? '');
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.2, 0.5, 1] },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [isLoading]);

  // Close mobile nav on ESC
  useEffect(() => {
    if (!navOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navOpen]);

  const handleSectionPick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // For mobile: close drawer first, then scroll
  const handleSectionPickMobile = useCallback((id: string) => {
    setNavOpen(false);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  const set = useCallback(<K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRevert = () => {
    if (!data) return;
    setForm(mergeProfileToForm(data.profile, data.settings));
    setTheme(data.settings.theme);
  };

  const handleConfirm = async () => {
    await updateMutation.mutateAsync(form);
    setRevealing(false);
    setToast(true);
    setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const accent = findAccent(form.accent);

  if (isLoading) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-bg-0">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-t-gold border-border animate-spin" />
          <div className="[font-family:var(--f-mono)] text-[10px] tracking-[0.3em] uppercase text-text-lo">
            Loading hero data
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg-0)' }}>
      <AmbientBg />

      {/* ── Mobile nav drawer overlay ─────────────────────────── */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] flex-shrink-0 h-full overflow-y-auto animate-drawer-in-left">
            <ProfileSectionNav
              active={activeSection}
              onPick={handleSectionPickMobile}
              lastSaved={lastSaved}
              dirty={dirty}
            />
          </div>
          {/* backdrop */}
          <div
            className="flex-1 animate-[fade-in_0.3s_ease]"
            style={{
              background: 'color-mix(in oklab, var(--bg-0) 75%, transparent)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}

      {/* ── Mobile top bar ────────────────────────────────────── */}
      <div
        className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 border-b border-border-lo"
        style={{
          background: 'color-mix(in oklab, var(--panel) 95%, transparent)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Back sits in the pinned bar — inside the drawer it is two taps away. */}
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="w-9 h-9 -ml-1.5 flex-shrink-0 flex items-center justify-center rounded-xs text-text-md hover:text-gold hover:bg-bg-2 transition-colors"
          >
            <BackIcon />
          </Link>
          <div className="min-w-0">
            <div className="[font-family:var(--f-mono)] text-[8px] tracking-[0.28em] uppercase text-text-lo">
              EDITING CHAMBER
            </div>
            <h1 className="[font-family:var(--f-title)] italic font-medium text-[18px] leading-tight truncate">
              Hero Identity
            </h1>
          </div>
        </div>
        <button
          onClick={() => setNavOpen(true)}
          className="w-9 h-9 flex items-center justify-center text-text-hi hover:text-gold transition-colors"
          aria-label="Open section navigation"
        >
          <HamburgerIcon />
        </button>
      </div>

      {/* ── Main 3-column grid ────────────────────────────────── */}
      {/*
        mobile  (<768px) : 1 col  — nav hidden, right rail hidden
        md (768-1023px)  : 2 cols [220px + 1fr] — right rail hidden
        lg (1024-1279px) : 3 cols [220px + 1fr + 300px]
        xl (1280px+)     : 3 cols [260px + 1fr + 400px]
      */}
      <div
        className={cn(
          'relative z-[2] mx-auto min-h-screen',
          'grid grid-cols-1',
          'md:grid-cols-[220px_1fr]',
          'lg:grid-cols-[220px_1fr_300px]',
          'xl:grid-cols-[260px_1fr_400px]',
        )}
        style={{ maxWidth: 1640 }}
      >
        {/* Left nav — hidden on mobile, sidebar from md+ */}
        <div className="hidden md:block sticky top-0 h-screen">
          <ProfileSectionNav
            active={activeSection}
            onPick={handleSectionPick}
            lastSaved={lastSaved}
            dirty={dirty}
          />
        </div>

        {/* Middle form */}
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 pt-6 md:pt-8 pb-32 flex flex-col gap-10 md:gap-14">
          <FormSection id="identity" num="I" label="Identity" subtitle="Name · title · monogram">
            <IdentitySection form={form} onChange={set} />
          </FormSection>

          <FormSection id="class" num="II" label="Class & Path" subtitle="Choose how you progress">
            <ClassSection value={form.classId} onChange={(v) => set('classId', v)} />
          </FormSection>

          <FormSection
            id="companion"
            num="III"
            label="Companion"
            subtitle="Pick your travelling spirit"
          >
            <CompanionSection value={form.companionId} onChange={(v) => set('companionId', v)} />
          </FormSection>

          <FormSection id="theme" num="IV" label="Theme & Sigil" subtitle="Colour of your light">
            <ThemeSection value={form.accent} onChange={(v) => set('accent', v)} />
          </FormSection>

          <FormSection id="stats" num="V" label="Attributes" subtitle="Allocate your points">
            <StatsSection
              stats={form.stats}
              pool={form.statPool}
              onChange={(v) => set('stats', v)}
            />
          </FormSection>

          <FormSection
            id="focus"
            num="VI"
            label="Focus Categories"
            subtitle="What quests you draw, in order of priority"
          >
            <FocusSection value={form.primaryFocus} onChange={(v) => set('primaryFocus', v)} />
          </FormSection>

          <FormSection id="badges" num="VII" label="Showcase" subtitle="Up to four worn badges">
            <BadgesSection value={form.badges} onChange={(v) => set('badges', v)} />
          </FormSection>

          <FormSection
            id="prefs"
            num="VIII"
            label="Quest Behaviour"
            subtitle="Cadence and difficulty"
          >
            <PrefsSection form={form} onChange={set} />
          </FormSection>

          <FormSection
            id="cash-log"
            num="IX"
            label="Cash Reminder"
            subtitle="Log what you spent in cash"
          >
            <CashLogSection form={form} onChange={set} />
          </FormSection>

          <FormSection id="appearance" num="X" label="Appearance" subtitle="Light, dark or system">
            <AppearanceSection
              value={form.theme}
              onChange={(v) => {
                set('theme', v);
                setTheme(v); // live preview; persisted on save
              }}
            />
          </FormSection>
        </div>

        {/* Right rail (HeroCard) — hidden until lg */}
        <div className="hidden lg:flex sticky top-0 h-screen p-7 pl-4 flex-col overflow-hidden">
          <HeroCard form={form} />
        </div>
      </div>

      {/* ── Fixed action bar ──────────────────────────────────── */}
      {/*
        mobile : spans full width (left-4 right-4)
        md     : starts after 220px nav, full right (md:left-[220px] md:right-0 md:mx-4)
        lg     : between 220px nav and 300px right rail
        xl     : between 260px nav and 400px right rail
      */}
      <div
        className={cn(
          'fixed bottom-5 z-10 flex justify-between items-center gap-3 px-4 sm:px-[22px] py-4',
          'border border-border rounded-md',
          'left-4 right-4',
          'md:left-[220px] md:right-0 md:mx-4',
          'lg:left-[220px] lg:right-[300px] lg:mx-8',
          'xl:left-[260px] xl:right-[400px] xl:mx-10',
        )}
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--panel) 92%, transparent), color-mix(in oklab, var(--panel2) 96%, transparent))',
          backdropFilter: 'blur(12px)',
          boxShadow: 'var(--sh-4)',
        }}
      >
        <div className="flex gap-3 sm:gap-[22px] items-center min-w-0">
          <div className="hidden sm:block min-w-0">
            <div className="[font-family:var(--f-mono)] text-[9px] tracking-[0.26em] uppercase text-text-lo">
              YOUR EDITS
            </div>
            <div className="[font-family:var(--f-title)] italic text-[14px] text-text-md truncate">
              A draft self, waiting to be sealed.
            </div>
          </div>
          <div className="flex items-center gap-[5px] [font-family:var(--f-mono)] text-[9px] tracking-[0.14em] uppercase text-text-lo">
            <span
              className="w-[6px] h-[6px] rounded-full flex-shrink-0"
              style={
                dirty
                  ? { background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }
                  : { background: 'var(--text-lo)' }
              }
            />
            <span className="hidden sm:inline">
              {dirty ? tStatus('unsaved') : tStatus('clean')}
            </span>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-[10px] flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleRevert}>
            Revert
          </Button>
          <Button variant="primary" size="sm" onClick={() => setRevealing(true)}>
            <span className="[font-family:var(--f-title)] italic text-[14px]">✦</span>
            <span className="hidden sm:inline">Reveal hero</span>
            <span className="sm:hidden">Save</span>
          </Button>
        </div>
      </div>

      {/* Reveal modal */}
      {revealing && (
        <RevealModal form={form} onClose={() => setRevealing(false)} onConfirm={handleConfirm} />
      )}

      {/* Success toast */}
      {toast && <SuccessToast accentGlow={accent.glow} onDismiss={() => setToast(false)} />}
    </div>
  );
}

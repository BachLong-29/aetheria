import { useTranslations } from 'next-intl';
import { CoinIcon } from '@/components/common/CoinIcon';
import { Link } from '@/i18n/navigation';
import { HeroSigilCore } from './HeroSigilCore';

const embers = [
  { left: '8%', drift: '30px', duration: '14s', delay: '0s', color: '' },
  {
    left: '22%',
    drift: '-20px',
    duration: '17s',
    delay: '2s',
    color: 'var(--violet)',
    shadow: 'var(--violet), 0 0 12px var(--violet-glow)',
  },
  { left: '35%', drift: '40px', duration: '12s', delay: '5s', color: '' },
  { left: '48%', drift: '-30px', duration: '18s', delay: '1s', color: '' },
  {
    left: '62%',
    drift: '25px',
    duration: '15s',
    delay: '3s',
    color: 'var(--cyan)',
    shadow: 'var(--cyan), 0 0 12px var(--cyan-glow)',
  },
  { left: '75%', drift: '-40px', duration: '20s', delay: '4s', color: '' },
  { left: '90%', drift: '30px', duration: '16s', delay: '0.5s', color: '' },
] as const;

// The 24 Elder Futhark runes, three times round, one every 5° — close enough to read as a ring
// of writing on the outer circle.
const FUTHARK = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const RUNE_COUNT = 72;
const runes = Array.from({ length: RUNE_COUNT }, (_, i) => FUTHARK[i % FUTHARK.length]);
// A second, tighter band of writing on the inner circle, two rounds, turning the other way.
const INNER_RUNE_COUNT = 48;
const innerRunes = Array.from({ length: INNER_RUNE_COUNT }, (_, i) => FUTHARK[i % FUTHARK.length]);
// And a third, tightest band around the core, turning with the outer one again.
const CORE_RUNE_COUNT = 40;
const coreRunes = Array.from(
  { length: CORE_RUNE_COUNT },
  (_, i) => FUTHARK[(i * 5) % FUTHARK.length],
);

export function LandingHero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="lp-hero">
      <div className="lp-embers">
        {embers.map((e, i) => (
          <div
            key={i}
            className="lp-ember"
            style={
              {
                left: e.left,
                '--drift': e.drift,
                animationDuration: e.duration,
                animationDelay: e.delay,
                ...(e.color ? { background: e.color, boxShadow: `0 0 6px ${e.shadow}` } : {}),
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="hero-left">
        <div className="lp-hero-tag reveal in">
          <span className="pulse" />
          <span>{t('tag')}</span>
        </div>

        <h1 className="reveal in">
          {t('headline1')}{' '}
          <span className="bg-[linear-gradient(135deg,oklch(0.92_0.08_82),var(--gold)_50%,oklch(0.55_0.18_82))] bg-clip-text text-transparent [filter:drop-shadow(0_0_24px_oklch(0.78_0.16_82_/_0.35))]">
            {t('headline2')}
          </span>
          <br />
          {t('headline3')}
          <br />
          {t('headline4')}{' '}
          <span className="bg-[linear-gradient(135deg,var(--violet),oklch(0.85_0.12_295))] bg-clip-text text-transparent">
            {t('headline5')}
          </span>
        </h1>

        <p className="lp-hero-sub reveal in">
          {t.rich('sub', { em: (chunks) => <em>{chunks}</em> })}
        </p>

        <div className="lp-hero-cta reveal in">
          <Link className="lp-btn-epic" href="/login">
            {t('ctaBegin')}
          </Link>
          <a className="lp-btn-ghost" href="#system">
            {t('ctaSeeHow')}
          </a>
        </div>

        <div className="lp-hero-trust reveal in">
          <div className="lp-trust-item">
            <div className="num">142k</div>
            <div className="label">{t('trustHeroes')}</div>
          </div>
          <div className="lp-trust-item">
            <div className="num">3.4M</div>
            <div className="label">{t('trustQuests')}</div>
          </div>
          <div className="lp-trust-item">
            <div className="num">94%</div>
            <div className="label">{t('trustRetention')}</div>
          </div>
        </div>
      </div>

      <div className="lp-hero-art">
        <div className="lp-hero-disc" />
        <div className="lp-hero-sigil">
          <div className="lp-sigil-ring r1">
            {runes.map((rune, i) => (
              <div
                key={i}
                className="lp-sigil-rune"
                style={{ transform: `rotate(${(i * 360) / RUNE_COUNT}deg)` }}
              >
                {rune}
              </div>
            ))}
          </div>
          <div className="lp-sigil-ring r2" />
          <div className="lp-sigil-ring runes-in">
            {innerRunes.map((rune, i) => (
              <div
                key={i}
                className="lp-sigil-rune in"
                style={{ transform: `rotate(${(i * 360) / INNER_RUNE_COUNT}deg)` }}
              >
                {rune}
              </div>
            ))}
          </div>
          <div className="lp-sigil-ring r3" />
          <div className="lp-sigil-ring runes-core">
            {coreRunes.map((rune, i) => (
              <div
                key={i}
                className="lp-sigil-rune core"
                style={{ transform: `rotate(${(i * 360) / CORE_RUNE_COUNT}deg)` }}
              >
                {rune}
              </div>
            ))}
          </div>
          <div className="lp-sigil-ring r4" />
          <HeroSigilCore />
        </div>

        <div className="lp-float-card fc1">
          <div className="lp-fc-label">
            <span className="dot" />
            {t('cardLevelUp')}
          </div>
          <div className="lp-fc-row">
            <div
              className="lp-fc-icon"
              style={{
                background: 'linear-gradient(135deg, var(--gold-fill-2), var(--gold-fill))',
                color: 'var(--on-gold-fill)',
              }}
            >
              ★
            </div>
            <div>
              <div className="lp-fc-main">Lv. 24 → 25</div>
              <div className="lp-fc-sub">{t('cardLevelSub')}</div>
            </div>
          </div>
          <div className="lp-fc-bar">
            <div style={{ width: '84%' }} />
          </div>
        </div>

        <div className="lp-float-card fc2">
          <div className="lp-fc-label" style={{ color: 'var(--violet)' }}>
            <span className="dot" style={{ background: 'var(--violet)' }} />
            {t('cardQuestComplete')}
          </div>
          <div className="lp-fc-row">
            <div
              className="lp-fc-icon"
              style={{
                background: 'oklch(0.68 0.22 295 / 0.18)',
                borderColor: 'oklch(0.68 0.22 295 / 0.4)',
                color: 'var(--violet)',
              }}
            >
              ✓
            </div>
            <div>
              <div className="lp-fc-main">{t('cardQuestName')}</div>
              <div className="lp-fc-sub">{t('cardStreakPreserved')}</div>
            </div>
          </div>
          <div className="lp-fc-stats">
            <div className="lp-fc-stat">
              XP <strong>+120</strong>
            </div>
            <div className="lp-fc-stat">
              <CoinIcon /> <strong>+24</strong>
            </div>
          </div>
        </div>

        <div className="lp-float-card fc3">
          <div className="lp-fc-label" style={{ color: 'var(--mint)' }}>
            <span className="dot" style={{ background: 'var(--mint)' }} />
            {t('cardStreakActive')}
          </div>
          <div className="lp-fc-row">
            <div
              className="lp-fc-icon"
              style={{
                background: 'oklch(0.76 0.14 162 / 0.18)',
                borderColor: 'oklch(0.76 0.14 162 / 0.4)',
                color: 'var(--mint)',
              }}
            >
              🔥
            </div>
            <div>
              <div className="lp-fc-main">{t('cardStreakDays')}</div>
              <div className="lp-fc-sub">{t('cardStreakMultiplier')}</div>
            </div>
          </div>
        </div>

        <div className="lp-float-card fc4">
          <div className="lp-fc-label" style={{ color: 'var(--cyan)' }}>
            <span className="dot" style={{ background: 'var(--cyan)' }} />
            {t('cardAchievement')}
          </div>
          <div className="lp-fc-row">
            <div
              className="lp-fc-icon"
              style={{
                background: 'oklch(0.78 0.16 205 / 0.18)',
                borderColor: 'oklch(0.78 0.16 205 / 0.4)',
                color: 'var(--cyan)',
              }}
            >
              🏆
            </div>
            <div>
              <div className="lp-fc-main">{t('cardAchievementName')}</div>
              <div className="lp-fc-sub">{t('cardAchievementSub')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

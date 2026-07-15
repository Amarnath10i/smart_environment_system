/**
 * EarthPulse brand mark.
 *
 * Replaces the stock Lucide leaf, which said "generic eco" and nothing about
 * this product. The mark is the name made literal: a globe (the ring, with a
 * meridian implying rotation) carrying a live pulse across it — earth + pulse.
 *
 * Drawn on a 24px grid with a single stroke weight so it stays legible at the
 * 15px sidebar size, and inherits `currentColor` so one component serves every
 * context rather than hardcoding a brand colour.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label="EarthPulse"
    >
      {/* Globe */}
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      {/* Meridian — reads as a sphere rather than a flat ring */}
      <ellipse cx="12" cy="12" rx="4.1" ry="9.25" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      {/* Pulse: the one solid element, so the eye lands on the live signal */}
      <path
        d="M2.9 12.4h4.05l2.1-4.2 2.85 8.1 2.35-5.55 1.5 1.65h5.45"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Wordmark + mark lockup for the sidebar and the sign-in screen. */
export function LogoLockup({ size = 26, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: size + 12,
          height: size + 12,
          borderRadius: 10,
          background: 'var(--brand-grad)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Logo size={size - 4} />
      </div>
      <div style={{ lineHeight: 1.15 }}>
        <p className="brand-text" style={{ fontSize: size * 0.62, fontWeight: 600, letterSpacing: '-0.025em' }}>
          EarthPulse
        </p>
        {subtitle && <p style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 450 }}>{subtitle}</p>}
      </div>
    </div>
  )
}

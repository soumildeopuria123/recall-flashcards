import { motion } from 'motion/react'

import { cx } from '../lib/cx'

/**
 * Pip — the Recall mascot. A rounded card-sprite in the app's indigo, with a
 * cream face and a flashcard tucked behind one ear to echo the logo. Moods
 * drive the eyes and mouth; the body bobs gently so it feels alive without
 * competing with the content around it.
 */
export function Mascot({
  mood = 'happy',
  size = 96,
  bob = true,
  className,
}: {
  mood?: 'happy' | 'celebrate' | 'sad'
  size?: number
  bob?: boolean
  className?: string
}) {
  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cx('shrink-0 select-none', className)}
      role="img"
      aria-label="Pip, the Recall mascot"
      initial={false}
      animate={bob ? { y: [0, -4, 0] } : undefined}
      transition={bob ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      <defs>
        <linearGradient id="pip-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6f62f5" />
          <stop offset="100%" stopColor="#4a3de0" />
        </linearGradient>
        <radialGradient id="pip-glow" cx="50%" cy="36%" r="52%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Flashcard behind the head, tilted like the logo's stacked cards. */}
      <g transform="rotate(-14 62 44)">
        <rect x="76" y="26" width="30" height="38" rx="8" fill="#ffffff" stroke="#dedcf7" strokeWidth="2" />
        <rect x="83" y="36" width="16" height="3.4" rx="1.7" fill="#c9c5f5" />
        <rect x="83" y="43" width="12" height="3.4" rx="1.7" fill="#dcd9f9" />
      </g>

      {/* Body: a soft squircle. */}
      <rect x="14" y="34" width="86" height="76" rx="30" fill="url(#pip-body)" />
      <rect x="14" y="34" width="86" height="76" rx="30" fill="url(#pip-glow)" />

      {/* Little arms, drawn in a deeper shade so they read against the body.
          The right one waves when celebrating. */}
      <ellipse cx="13" cy="78" rx="7.5" ry="9.5" fill="#3a2fc4" transform="rotate(-18 13 78)" />
      <motion.ellipse
        cx="107"
        cy="76"
        rx="7.5"
        ry="9.5"
        fill="#3a2fc4"
        animate={mood === 'celebrate' ? { rotate: [0, -20, 0, -20, 0] } : { rotate: 0 }}
        transition={mood === 'celebrate' ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        style={{ transformOrigin: '107px 80px' }}
      />

      {/* Cream face patch. */}
      <path d="M32 58c0-9 8-16 26-16s26 7 26 16v10c0 12-11 20-26 20s-26-8-26-20Z" fill="#fdf7ec" />

      {/* Feet. */}
      <ellipse cx="42" cy="111" rx="10" ry="5" fill="#3a2fc4" />
      <ellipse cx="72" cy="111" rx="10" ry="5" fill="#3a2fc4" />

      {mood === 'celebrate' ? (
        <>
          {/* Squeezed-shut happy eyes. */}
          <path d="M42 70c3-4 8-4 11 0" fill="none" stroke="#2c2540" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M61 70c3-4 8-4 11 0" fill="none" stroke="#2c2540" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M50 78c3 4 8 5 12 3" fill="none" stroke="#2c2540" strokeWidth="3" strokeLinecap="round" />
          {/* Sparkles. */}
          <g fill="#f2b134">
            <path d="M10 46l2.2 5.4L18 53.6l-5.8 2.2L10 61.2l-2.2-5.4L2 53.6l5.8-2.2Z" />
            <path d="M110 34l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z" />
          </g>
        </>
      ) : (
        <>
          {/* Big attentive eyes. */}
          <ellipse cx="47" cy="71" rx="5.6" ry="6.4" fill="#2c2540" />
          <ellipse cx="67" cy="71" rx="5.6" ry="6.4" fill="#2c2540" />
          <circle cx="48.8" cy="68.6" r="1.9" fill="#ffffff" />
          <circle cx="68.8" cy="68.6" r="1.9" fill="#ffffff" />
          {mood === 'sad' ? (
            <>
              {/* Drawn-in eyebrows and a small frown. */}
              <path d="M41 62l10-2.5" fill="none" stroke="#2c2540" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M73 62l-10-2.5" fill="none" stroke="#2c2540" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M50 85c3-4 10-4 13 0" fill="none" stroke="#2c2540" strokeWidth="3" strokeLinecap="round" />
              {/* A welling tear under the right eye. */}
              <path d="M72 82c0 0 3 3.4 3 5.2a3 3 0 0 1-6 0c0-1.8 3-5.2 3-5.2Z" fill="#8fb7ff" />
              <circle cx="73.6" cy="87.4" r="0.9" fill="#ffffff" opacity="0.85" />
            </>
          ) : (
            <path d="M49 81c3 5 11 5 14 0" fill="none" stroke="#2c2540" strokeWidth="3.2" strokeLinecap="round" />
          )}
        </>
      )}
      {/* Cheeks. */}
      <ellipse cx="34" cy="82" rx="4.4" ry="2.8" fill="#f0a4a4" opacity="0.5" />
      <ellipse cx="80" cy="82" rx="4.4" ry="2.8" fill="#f0a4a4" opacity="0.5" />
    </motion.svg>
  )
}

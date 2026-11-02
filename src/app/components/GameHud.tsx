import { Flame, Heart } from 'lucide-react'
import { motion } from 'motion/react'

import { cx } from '../lib/cx'

/** Duolingo-style lives: five hearts, spent ones show as empty sockets. */
export function Hearts({ left, className }: { left: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)} aria-label={`${left} of 5 hearts left`}>
      {Array.from({ length: 5 }, (_, i) => {
        const alive = i < left
        return <Heart key={i} className={cx('size-4 transition-colors', alive ? 'fill-danger text-danger' : 'fill-raised text-line-strong')} />
      })}
    </span>
  )
}

/** Combo blaze: shows from two correct answers in a row and counts up. */
export function Combo({ n, className }: { n: number; className?: string }) {
  if (n < 2) return null
  return (
    <motion.span
      key={n}
      initial={{ scale: 0.5, opacity: 0.4 }}
      animate={{ scale: [1.25, 1], opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cx('inline-flex h-7 items-center gap-1 rounded-[9px] bg-warning-soft px-2.5 text-[13px] font-semibold tabular-nums text-warning', className)}
    >
      <Flame className="size-4" />
      {n} combo
    </motion.span>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function Preloader({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const start = performance.now()
    const DURATION = 1700
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      // ease-out quint
      const eased = 1 - Math.pow(1 - t, 5)
      setProgress(Math.round(eased * 100))
      if (t < 1) raf = requestAnimationFrame(tick)
      else {
        setTimeout(() => {
          setVisible(false)
          onDone()
        }, 300)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ y: '-100%' }}
          transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[200] flex items-end justify-between bg-ink-950 px-8 pb-10 md:px-14"
        >
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper-50/60">
            Загрузка · Mathematica
          </div>
          <div className="relative overflow-hidden font-display text-[clamp(5rem,22vw,22rem)] font-light leading-none tracking-tighter text-paper-50">
            <motion.span
              initial={{ y: '0%' }}
              animate={{ y: progress === 100 ? '-100%' : '0%' }}
              transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
              className="block tabular-nums"
            >
              {String(progress).padStart(3, '0')}
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

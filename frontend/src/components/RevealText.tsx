import { motion, useInView } from 'framer-motion'
import { ReactNode, useRef } from 'react'

type Props = {
  children: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
  className?: string
  delay?: number
  stagger?: number
  by?: 'word' | 'char' | 'line'
}

export function RevealText({
  children,
  as = 'span',
  className = '',
  delay = 0,
  stagger = 0.04,
  by = 'word',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  const units =
    by === 'char'
      ? children.split('')
      : by === 'line'
      ? children.split('\n')
      : children.split(' ')

  const Comp = motion[as] as any

  return (
    <Comp
      ref={ref}
      className={`inline-block ${className}`}
      aria-label={children}
    >
      <span className="sr-only">{children}</span>
      <span aria-hidden className="inline-block">
        {units.map((u, i) => (
          <span key={i} className="inline-block overflow-hidden align-baseline">
            <motion.span
              initial={{ y: '110%' }}
              animate={inView ? { y: '0%' } : { y: '110%' }}
              transition={{
                duration: 0.9,
                ease: [0.22, 1, 0.36, 1],
                delay: delay + i * stagger,
              }}
              className="inline-block"
            >
              {u === ' ' ? ' ' : u}
              {by === 'word' && i < units.length - 1 ? ' ' : null}
            </motion.span>
          </span>
        ))}
      </span>
    </Comp>
  )
}

export function Reveal({
  children,
  delay = 0,
  y = 40,
  className = '',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

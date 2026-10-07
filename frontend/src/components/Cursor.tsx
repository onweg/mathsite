import { useEffect, useRef } from 'react'

export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const state = useRef({
    x: 0, y: 0, rx: 0, ry: 0,
    scale: 1, targetScale: 1,
    label: '',
  })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      state.current.x = e.clientX
      state.current.y = e.clientY
    }

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-cursor]')
      if (el) {
        const kind = el.getAttribute('data-cursor') || ''
        state.current.targetScale = kind === 'lg' ? 2.6 : 1.8
        state.current.label = el.getAttribute('data-cursor-label') || ''
      } else {
        state.current.targetScale = 1
        state.current.label = ''
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseover', onOver, { passive: true })

    let raf = 0
    const tick = () => {
      const s = state.current
      // dot — snappy
      s.rx += (s.x - s.rx) * 0.9
      s.ry += (s.y - s.ry) * 0.9
      if (dotRef.current)
        dotRef.current.style.transform = `translate3d(${s.rx - 3}px, ${s.ry - 3}px, 0)`
      // ring — lagging
      const ringX = parseFloat(ringRef.current?.dataset.x || '0')
      const ringY = parseFloat(ringRef.current?.dataset.y || '0')
      const nx = ringX + (s.x - ringX) * 0.18
      const ny = ringY + (s.y - ringY) * 0.18
      s.scale += (s.targetScale - s.scale) * 0.15
      if (ringRef.current) {
        ringRef.current.dataset.x = String(nx)
        ringRef.current.dataset.y = String(ny)
        ringRef.current.style.transform =
          `translate3d(${nx - 20}px, ${ny - 20}px, 0) scale(${s.scale})`
      }
      if (textRef.current) {
        textRef.current.style.transform = `translate3d(${nx + 24}px, ${ny + 10}px, 0)`
        textRef.current.textContent = s.label
        textRef.current.style.opacity = s.label ? '1' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[100] h-10 w-10 rounded-full border border-paper-50/60 mix-blend-difference transition-[border-color] duration-300"
      />
      <div
        ref={dotRef}
        className="pointer-events-none fixed left-0 top-0 z-[101] h-1.5 w-1.5 rounded-full bg-paper-50 mix-blend-difference"
      />
      <div
        ref={textRef}
        className="pointer-events-none fixed left-0 top-0 z-[102] select-none font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50 opacity-0 transition-opacity duration-200"
      />
    </>
  )
}

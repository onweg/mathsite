import { useEffect } from 'react'
import { BASE, studentAuth } from '../lib/api'
import { getToken } from '../lib/auth'
import { ANALYTICS_IDENTITY_EVENT, currentVisit } from '../lib/analyticsSession'

const SECTIONS: Record<string, string> = {
  top: 'home', ai: 'ai', missed: 'missed', weekly: 'weekly', quizzes: 'quizzes',
  library: 'library', feedback: 'feedback',
}
const IDLE_MS = 120_000
const PULSE_MS = 15_000

function allowed(): boolean {
  const path = window.location.pathname
  return !getToken() && (path === '/' || path === '/me' || path.startsWith('/library'))
}

/** Use visible sections, since most of the site is one scrolling page. */
function visiblePage(): string {
  if (window.location.pathname === '/me') return 'profile'
  let page = 'home'
  for (const [id, label] of Object.entries(SECTIONS)) {
    const element = document.getElementById(id)
    if (!element) continue
    const rect = element.getBoundingClientRect()
    if (rect.top <= innerHeight * 0.5 && rect.bottom > innerHeight * 0.5) page = label
  }
  if (page === 'library') {
    const collection = window.location.pathname.split('/')[2]
    if (['around', 'olympiad', 'oge', 'ege'].includes(collection)) page = collection
  }
  return page
}

type View = { id: string; visit_id: string; page: string; active_seconds: number; day: number; sent_seconds: number }

/** Best-effort analytics must never block learning or show tracking errors. */
export function useAnalytics(): void {
  useEffect(() => {
    let disposed = false
    let identity: string | null = null
    let identityVersion = 0
    let view: View | null = null
    let previous = Date.now()
    let lastInput = previous
    let lastSent = 0
    let candidate = ''
    let candidateSince = previous

    function send(keepalive = false) {
      if (!view) return
      const seconds = Math.floor(view.active_seconds)
      // Closing an idle/background tab must not move "last seen" forward.
      if (seconds === view.sent_seconds) return
      const { day: _day, sent_seconds: _sent, ...body } = view
      view.sent_seconds = seconds
      void fetch(`${BASE}/analytics/pulse`, {
        method: 'POST', credentials: 'include', keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, active_seconds: seconds }),
      }).catch(() => {})
      lastSent = Date.now()
    }

    async function identify() {
      const version = ++identityVersion
      identity = null
      // Identity already changed on the server: don't send the old page with new cookies.
      view = null
      if (!allowed()) return
      const student = await studentAuth.me()
      if (!disposed && version === identityVersion) identity = student?.id ?? 'anonymous'
    }

    function tick() {
      const now = Date.now()
      const elapsed = Math.min(2, Math.max(0, (now - previous) / 1000))
      previous = now
      if (!identity || !allowed() || document.hidden || !document.hasFocus() || now - lastInput >= IDLE_MS) return
      const visit = currentVisit(identity, now)
      const page = visiblePage()
      const day = Math.floor((now + 3 * 3600_000) / 86400_000)
      if (page !== candidate) { candidate = page; candidateSince = now }
      const changePage = view && page !== view.page && now - candidateSince >= 2000
      if (!view || view.visit_id !== visit || view.day !== day || changePage) {
        send()
        view = { id: crypto.randomUUID(), visit_id: visit, page, active_seconds: 0, day, sent_seconds: -1 }
        send()
      } else {
        view.active_seconds += elapsed
        if (now - lastSent >= PULSE_MS) send()
      }
    }

    const input = () => { lastInput = Date.now() }
    const suspend = () => { send(true); previous = Date.now() }
    const visibility = () => {
      if (document.hidden) suspend()
      else { input(); previous = Date.now() }
    }
    const storage = (event: StorageEvent) => {
      if (event.key === 'mathsite.analytics.visit' && event.newValue === null) void identify()
    }
    void identify()
    const timer = window.setInterval(tick, 1000)
    const inputEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'focus']
    inputEvents.forEach((event) => window.addEventListener(event, input, { passive: true }))
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', suspend)
    window.addEventListener('blur', suspend)
    window.addEventListener(ANALYTICS_IDENTITY_EVENT, identify)
    window.addEventListener('storage', storage)
    return () => {
      disposed = true
      clearInterval(timer)
      send(true)
      inputEvents.forEach((event) => window.removeEventListener(event, input))
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', suspend)
      window.removeEventListener('blur', suspend)
      window.removeEventListener(ANALYTICS_IDENTITY_EVENT, identify)
      window.removeEventListener('storage', storage)
    }
  }, [])
}

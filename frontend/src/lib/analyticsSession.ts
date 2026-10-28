export const ANALYTICS_IDENTITY_EVENT = 'analytics:identity'
const KEY = 'mathsite.analytics.visit'
export const VISIT_IDLE_MS = 30 * 60 * 1000

type Visit = { id: string; last: number; identity: string }
let fallback: Visit | null = null

export function visitExpired(visit: Visit, identity: string, now: number): boolean {
  return visit.identity !== identity || now - visit.last >= VISIT_IDLE_MS || now < visit.last
}

/** Shared by tabs, but only the foreground tab refreshes activity. No fingerprint. */
export function currentVisit(identity: string, now: number): string {
  let visit = fallback
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.id === 'string' && typeof parsed.last === 'number' &&
          typeof parsed.identity === 'string') visit = parsed
    }
  } catch { /* storage disabled: retain the visit in memory */ }
  if (!visit || visitExpired(visit, identity, now)) {
    visit = { id: crypto.randomUUID(), last: now, identity }
  }
  visit.last = now
  fallback = visit
  try { localStorage.setItem(KEY, JSON.stringify(visit)) } catch { /* optional */ }
  return visit.id
}

export function resetAnalyticsIdentity(): void {
  fallback = null
  try { localStorage.removeItem(KEY) } catch { /* optional */ }
  window.dispatchEvent(new Event(ANALYTICS_IDENTITY_EVENT))
}

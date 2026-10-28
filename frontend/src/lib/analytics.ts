import { apiJson } from './api'

export type StudentStats = {
  id: string; name: string; class_label: string; visits: number; active_seconds: number
  last_seen: string | null; last_visit: string | null; last_activity: string | null
  quiz_attempts: number; average_score: number | null; weekly_submissions: number
  weekly_correct: number; library_views: number; poll_answers: number
}
export type AnalyticsReport = {
  timezone: string; tracking_since: string | null; classes: string[]
  totals: {
    visits: number; anonymous_visits: number; visitors: number; page_views: number
    active_seconds: number; quiz_attempts: number; average_score: number
    weekly_submissions: number; weekly_pending: number; library_views: number; poll_answers: number
  }
  students: StudentStats[]
  quizzes: {
    quiz_id: string; title: string; student_id: string | null; student_name: string
    class_label: string; attempts: number; best_score: number; average_score: number
    last_score: number; last_total: number; last_attempt: string
  }[]
  weekly: {
    id: string; task_id: string; title: string; student_id: string | null; student_name: string
    class_label: string; status: 'new' | 'correct' | 'partial' | 'wrong'; teacher_comment: string | null
    solution_md: string; image_filename: string | null; created_at: string; reviewed_at: string | null
  }[]
  content: {
    collection: string; item_id: string | null; title: string; action: string
    views: number; students: number; last_view: string
  }[]
  pages: { page: string; views: number; visits: number; students: number; active_seconds: number }[]
  polls: {
    id: string; poll_id: string; title: string; student_id: string | null; student_name: string
    class_label: string; choices: string; comment: string; created_at: string
  }[]
  daily: { day: string; visits: number; active_seconds: number; attempts: number }[]
}

export function getAnalytics(token: string, filters: {
  start?: string; end?: string; class_label?: string; student_id?: string
}): Promise<AnalyticsReport> {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, value)
  })
  return apiJson(`/admin/analytics?${query}`, { method: 'GET', token })
}

export const PAGE_LABELS: Record<string, string> = {
  home: 'Главная', ai: 'ИИ-теоретик', missed: 'Пропустил урок', weekly: 'Задача недели',
  quizzes: 'Тесты', library: 'Библиотека', around: 'Математика вокруг нас',
  olympiad: 'Олимпиады', oge: 'ОГЭ', ege: 'ЕГЭ', feedback: 'Опросы', profile: 'Личный кабинет',
}

export type AnalyticsInsights = {
  summary: string
  findings: {
    ref: string; title: string; kind: string; observation: string; recommendation: string
    confidence: 'low' | 'medium' | 'high'; metrics: Record<string, number | null>
  }[]
  next_steps: { ref: string; title: string; action: string; check: string }[]
  limitations: string[]
  coverage: Record<string, { total: number; included: number }>
  generated_at: string
  period: { start: string | null; end: string }
  provider: string
}

export function analyzeAnalytics(token: string, start: string, end: string): Promise<AnalyticsInsights> {
  return apiJson('/admin/analytics/insights', {
    method: 'POST', token, body: { start: start || null, end },
  })
}

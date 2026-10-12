const BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; text: string }
export type Topic = 'algebra' | 'geometry'

export type ChatReply = {
  text: string
  blocked: boolean
  reason: string | null
}

export async function chat(
  messages: ChatMessage[],
  opts: { topic?: Topic; section?: string } = {},
): Promise<ChatReply> {
  const r = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, topic: opts.topic, section: opts.section }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`chat ${r.status}: ${text || r.statusText}`)
  }
  const data = (await r.json()) as {
    text: string
    blocked?: boolean
    reason?: string | null
  }
  return {
    text: data.text,
    blocked: Boolean(data.blocked),
    reason: data.reason ?? null,
  }
}

export type RagChunk = {
  page: number | null
  source: string
  similarity: number
  preview: string
}

export type RagReply = {
  text: string
  blocked: boolean
  reason: string | null
  chunks: RagChunk[]
}

export async function askRag(
  query: string,
  opts: { topic?: Topic; limit?: number } = {},
): Promise<RagReply> {
  const r = await fetch(`${BASE}/rag/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topic: opts.topic, limit: opts.limit ?? 5 }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`rag ${r.status}: ${text || r.statusText}`)
  }
  const data = (await r.json()) as RagReply
  return {
    text: data.text,
    blocked: Boolean(data.blocked),
    reason: data.reason ?? null,
    chunks: data.chunks ?? [],
  }
}

export async function health(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`)
    return r.ok
  } catch {
    return false
  }
}

// ====== Auth (учитель-администратор) ======

export type AdminUser = {
  id: string
  email: string
  name: string
  role: string
}

export type LoginResponse = {
  user: AdminUser
  access_token: string
  token_type: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail || `login ${r.status}`)
  }
  return (await r.json()) as LoginResponse
}

export async function me(token: string): Promise<AdminUser> {
  const r = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`me ${r.status}`)
  return (await r.json()) as AdminUser
}

// ====== Квизы ======

export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuizStatus = 'draft' | 'published'
export type ItemKind = 'mcq' | 'short'
export type Source = 'textbook_8_algebra' | 'textbook_8_geometry' | 'olympiad'

export type QuizChoice = { id: string; text: string }

export type QuizItemDTO = {
  id: string | null
  position: number
  kind: ItemKind
  question_md: string
  choices: QuizChoice[]
  correct_answer: string
  explanation: string | null
}

export type QuizDTO = {
  id: string
  title: string
  topic: string
  difficulty: Difficulty
  status: QuizStatus
  source_key: Source | null
  items: QuizItemDTO[]
}

export type QuizSummaryDTO = {
  id: string
  title: string
  topic: string
  difficulty: Difficulty
  status: QuizStatus
  source_key: Source | null
  items_count: number
}

export type QuizItemPublicDTO = {
  id: string
  position: number
  kind: ItemKind
  question_md: string
  choices: QuizChoice[]
}

export type QuizPublicDTO = {
  id: string
  title: string
  topic: string
  difficulty: Difficulty
  items: QuizItemPublicDTO[]
}

export type AttemptResultDTO = {
  attempt_id: string
  score: number
  total: number
  per_item: { item_id: string; correct: boolean; expected: string; got: string }[]
}

export type AttemptSummaryDTO = {
  id: string
  student_name: string
  score: number
  total: number
  created_at: string
}

async function apiJson<T>(
  path: string,
  { method, token, body }: { method: string; token?: string | null; body?: unknown } = {
    method: 'GET',
  },
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (r.status === 204) return undefined as T
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    const detail = (data as { detail?: string }).detail || `${method} ${path} ${r.status}`
    throw new Error(detail)
  }
  return (await r.json()) as T
}

// ---- Admin ----
export const adminQuizzes = {
  list: (token: string) => apiJson<QuizSummaryDTO[]>('/admin/quizzes', { method: 'GET', token }),
  get: (token: string, id: string) =>
    apiJson<QuizDTO>(`/admin/quizzes/${id}`, { method: 'GET', token }),
  generate: (
    token: string,
    body: {
      title: string
      topic: string
      source_key: Source | null
      difficulty: Difficulty
      items_count: number
    },
  ) => apiJson<QuizDTO>('/admin/quizzes/generate', { method: 'POST', token, body }),
  updateMeta: (
    token: string,
    id: string,
    body: { title?: string; topic?: string },
  ) => apiJson<QuizDTO>(`/admin/quizzes/${id}`, { method: 'PATCH', token, body }),
  updateItem: (
    token: string,
    quizId: string,
    itemId: string,
    body: {
      question_md?: string
      choices?: QuizChoice[]
      correct_answer?: string
      explanation?: string | null
    },
  ) =>
    apiJson<QuizDTO>(`/admin/quizzes/${quizId}/items/${itemId}`, {
      method: 'PATCH',
      token,
      body,
    }),
  publish: (token: string, id: string) =>
    apiJson<QuizDTO>(`/admin/quizzes/${id}/publish`, { method: 'POST', token }),
  unpublish: (token: string, id: string) =>
    apiJson<QuizDTO>(`/admin/quizzes/${id}/unpublish`, { method: 'POST', token }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/quizzes/${id}`, { method: 'DELETE', token }),
  listAttempts: (token: string, id: string) =>
    apiJson<AttemptSummaryDTO[]>(`/admin/quizzes/${id}/attempts`, { method: 'GET', token }),
}

// ====== Задача недели ======

export type WeeklyTaskDTO = {
  id: string
  title: string
  body_md: string
  answer_md: string
  is_published: boolean
}

export type WeeklyTaskPublicDTO = {
  id: string
  title: string
  body_md: string
}

export const adminWeekly = {
  list: (token: string) => apiJson<WeeklyTaskDTO[]>('/admin/weekly', { method: 'GET', token }),
  get: (token: string, id: string) =>
    apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}`, { method: 'GET', token }),
  create: (
    token: string,
    body: { title: string; body_md: string; answer_md: string },
  ) => apiJson<WeeklyTaskDTO>('/admin/weekly', { method: 'POST', token, body }),
  update: (
    token: string,
    id: string,
    body: { title?: string; body_md?: string; answer_md?: string },
  ) => apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}`, { method: 'PATCH', token, body }),
  publish: (token: string, id: string) =>
    apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}/publish`, { method: 'POST', token }),
  unpublish: (token: string, id: string) =>
    apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}/unpublish`, { method: 'POST', token }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/weekly/${id}`, { method: 'DELETE', token }),
}

export const publicWeekly = {
  current: () => apiJson<WeeklyTaskPublicDTO | null>('/weekly', { method: 'GET' }),
}

// ---- Public ----
export const publicQuizzes = {
  list: () => apiJson<QuizSummaryDTO[]>('/quizzes', { method: 'GET' }),
  get: (id: string) => apiJson<QuizPublicDTO>(`/quizzes/${id}`, { method: 'GET' }),
  attempt: (id: string, body: { student_name: string; answers: Record<string, string> }) =>
    apiJson<AttemptResultDTO>(`/quizzes/${id}/attempt`, { method: 'POST', body }),
}

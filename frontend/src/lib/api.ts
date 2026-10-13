const BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

/**
 * Человеко-читаемые ошибки — показываем пользователю.
 * HTML от nginx и Python-трейсы наружу не должны уходить никогда.
 */
function humanError(status: number): string {
  if (status === 0) return 'Нет связи с сервером. Проверь интернет.'
  if (status === 401) return 'Нужно войти заново.'
  if (status === 403) return 'Нет доступа.'
  if (status === 404) return 'Не найдено.'
  if (status === 409) return 'Данные не прошли проверку.'
  if (status === 429) return 'Слишком часто. Подожди минуту и попробуй снова.'
  if (status === 502 || status === 503 || status === 504)
    return 'Сервер временно недоступен. Попробуй через минуту.'
  if (status >= 500) return 'Что-то пошло не так на сервере. Мы уже знаем.'
  return 'Что-то пошло не так. Попробуй ещё раз.'
}

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
    credentials: 'include',
    body: JSON.stringify({ messages, topic: opts.topic, section: opts.section }),
  })
  if (!r.ok) {
    throw new Error(humanError(r.status))
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
  opts: { topic?: Topic; source_key?: string; limit?: number } = {},
): Promise<RagReply> {
  const r = await fetch(`${BASE}/rag/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      query,
      topic: opts.topic,
      source_key: opts.source_key,
      limit: opts.limit ?? 5,
    }),
  })
  if (!r.ok) {
    throw new Error(humanError(r.status))
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
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) {
    let detail: string | undefined
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = await r.json().catch(() => ({}))
      detail = (data as { detail?: string }).detail
    }
    if (r.status === 401) throw new Error('Неверный email или пароль')
    throw new Error(detail || humanError(r.status))
  }
  return (await r.json()) as LoginResponse
}

export async function me(token: string): Promise<AdminUser> {
  const r = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
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
  student_id: string | null
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
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (r.status === 204) return undefined as T
  if (!r.ok) {
    // Пробуем вытащить detail из JSON. HTML от nginx / голый 500 — наружу не отдаём.
    let detail: string | undefined
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = await r.json().catch(() => ({}))
      detail = (data as { detail?: string }).detail
    }
    throw new Error(detail || humanError(r.status))
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

// ====== Материалы ======

export type MaterialStatus = 'pending' | 'indexing' | 'ready' | 'failed'

export type MaterialDTO = {
  id: string
  slug: string
  title: string
  source_key: string
  status: MaterialStatus
  chunks_count: number
  error_message: string | null
}

export type MaterialPublicDTO = {
  id: string
  title: string
  source_key: string
  chunks_count: number
}

export const adminMaterials = {
  list: (token: string) => apiJson<MaterialDTO[]>('/admin/materials', { method: 'GET', token }),
  get: (token: string, id: string) =>
    apiJson<MaterialDTO>(`/admin/materials/${id}`, { method: 'GET', token }),
  async upload(token: string, file: File, title: string): Promise<MaterialDTO> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', title)
    const r = await fetch(`${BASE}/admin/materials`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: fd,
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error((data as { detail?: string }).detail || `upload ${r.status}`)
    }
    const data = (await r.json()) as { material: MaterialDTO }
    return data.material
  },
  reindex: (token: string, id: string) =>
    apiJson<MaterialDTO>(`/admin/materials/${id}/reindex`, { method: 'POST', token }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/materials/${id}`, { method: 'DELETE', token }),
}

export const publicMaterials = {
  list: () => apiJson<MaterialPublicDTO[]>('/materials', { method: 'GET' }),
}

// ====== Ученики ======

export type StudentDTO = {
  id: string
  name: string
  class_label: string
  qr_token: string
  note: string | null
}

export type ClassSummaryDTO = {
  class_label: string
  count: number
}

export type ImportResultDTO = {
  created: number
  skipped_duplicates: number
  errors: { line: number; source: string; reason: string }[]
}

export type StudentPublicDTO = {
  id: string
  name: string
  class_label: string
}

export type StudentAttemptDTO = {
  id: string
  quiz_id: string
  quiz_title: string
  score: number
  total: number
  created_at: string
}

export const studentAuth = {
  activate: (token: string) =>
    apiJson<StudentPublicDTO>('/students/activate', {
      method: 'POST',
      body: { token },
    }),
  me: () =>
    apiJson<StudentPublicDTO | null>('/students/me', { method: 'GET' }).catch(
      () => null,
    ),
  logout: () => apiJson<void>('/students/logout', { method: 'POST' }),
  myAttempts: () =>
    apiJson<StudentAttemptDTO[]>('/students/me/attempts', { method: 'GET' }),
}

export const adminStudents = {
  list: (token: string, classLabel?: string) => {
    const qs = classLabel ? `?class_label=${encodeURIComponent(classLabel)}` : ''
    return apiJson<StudentDTO[]>(`/admin/students${qs}`, { method: 'GET', token })
  },
  classes: (token: string) =>
    apiJson<ClassSummaryDTO[]>('/admin/students/classes', { method: 'GET', token }),
  create: (
    token: string,
    body: { name: string; class_label: string; note?: string | null },
  ) => apiJson<StudentDTO>('/admin/students', { method: 'POST', token, body }),
  bulkText: (token: string, body: { text: string; default_class_label: string }) =>
    apiJson<ImportResultDTO>('/admin/students/bulk/text', { method: 'POST', token, body }),
  async bulkFile(
    token: string,
    kind: 'csv' | 'xlsx',
    file: File,
    defaultClassLabel: string,
  ): Promise<ImportResultDTO> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('default_class_label', defaultClassLabel)
    const r = await fetch(`${BASE}/admin/students/bulk/${kind}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: fd,
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error((data as { detail?: string }).detail || `import ${r.status}`)
    }
    return (await r.json()) as ImportResultDTO
  },
  update: (
    token: string,
    id: string,
    body: { name?: string; class_label?: string; note?: string | null },
  ) => apiJson<StudentDTO>(`/admin/students/${id}`, { method: 'PATCH', token, body }),
  regenerate: (token: string, id: string) =>
    apiJson<StudentDTO>(`/admin/students/${id}/regenerate`, { method: 'POST', token }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/students/${id}`, { method: 'DELETE', token }),
}

// ---- Public ----
export const publicQuizzes = {
  list: () => apiJson<QuizSummaryDTO[]>('/quizzes', { method: 'GET' }),
  get: (id: string) => apiJson<QuizPublicDTO>(`/quizzes/${id}`, { method: 'GET' }),
  attempt: (id: string, body: { student_name: string; answers: Record<string, string> }) =>
    apiJson<AttemptResultDTO>(`/quizzes/${id}/attempt`, { method: 'POST', body }),
}

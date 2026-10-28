import { resetAnalyticsIdentity } from './analyticsSession'

export const BASE =
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

/** Ошибка API с машинным кодом: по нему фронт различает ситуации. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
    readonly status = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
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
/** Встроенные учебники плюс любой загруженный материал: его ключ — `material_<hex>`. */
export type Source =
  | 'textbook_8_algebra'
  | 'textbook_8_geometry'
  | 'olympiad'
  | `material_${string}`

/** Один фрагмент учебника, найденный по теме. */
export type SourceHitDTO = {
  source_key: string
  page: number | null
  similarity: number
  text: string
  /** текст похож на формулу, развалившуюся при извлечении из PDF */
  garbled: boolean
}

export type SourcePreviewDTO = {
  hits: SourceHitDTO[]
  garbled_count: number
}

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
  /** Этот ученик уже проходил квиз. У анонимов всегда false. */
  attempted: boolean
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

export type QuizAttemptsSummaryDTO = {
  total_attempts: number
  anonymous_attempts: number
  students: {
    student_id: string
    student_name: string
    class_label: string
    attempts_count: number
    last_score: number
    last_total: number
    last_attempt_at: string
  }[]
}

export async function apiJson<T>(
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
    let code: string | null = null
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = await r.json().catch(() => ({}))
      detail = (data as { detail?: string }).detail
      code = (data as { code?: string }).code ?? null
    }
    throw new ApiError(detail || humanError(r.status), code, r.status)
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
      /** true — писать по программе 8 класса, если в учебнике ничего не нашлось */
      allow_without_source?: boolean
      /** false — не искать в учебнике вовсе, писать из знаний модели */
      use_materials?: boolean
      /** свободное пожелание учителя; в поиск по учебнику не идёт */
      hint?: string
    },
  ) => apiJson<QuizDTO>('/admin/quizzes/generate', { method: 'POST', token, body }),
  /** Доработка черновика по замечанию: модель правит то, о чём просят. */
  refine: (token: string, id: string, instruction: string) =>
    apiJson<QuizDTO>(`/admin/quizzes/${id}/refine`, {
      method: 'POST',
      token,
      body: { instruction },
    }),
  /** Что нашлось в учебнике по теме — до того, как тратить генерацию. */
  sourcePreview: (token: string, body: { topic: string; source_key: Source | null }) =>
    apiJson<SourcePreviewDTO>('/admin/quizzes/source-preview', {
      method: 'POST',
      token,
      body,
    }),
  /** Квиз руками, без нейросети. Вопросы можно прислать сразу или добавить потом. */
  create: (
    token: string,
    body: {
      title: string
      topic: string
      difficulty: Difficulty
      items?: Omit<QuizItemDTO, 'id'>[]
    },
  ) => apiJson<QuizDTO>('/admin/quizzes', { method: 'POST', token, body }),
  /** Замена всего списка вопросов: добавление и удаление. Пересоздаёт id. */
  replaceItems: (token: string, id: string, items: Omit<QuizItemDTO, 'id'>[]) =>
    apiJson<QuizDTO>(`/admin/quizzes/${id}/items`, {
      method: 'PUT',
      token,
      body: { items },
    }),
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
  attemptsSummary: (token: string, id: string) =>
    apiJson<QuizAttemptsSummaryDTO>(`/admin/quizzes/${id}/attempts/summary`, { method: 'GET', token }),
}

// ====== Задача недели ======

export type WeeklyTaskDTO = {
  id: string
  title: string
  body_md: string
  answer_md: string
  is_published: boolean
  submissions_count: number
  new_submissions_count: number
}

export type SubmissionStatus = 'new' | 'correct' | 'partial' | 'wrong'

export type WeeklySubmissionDTO = {
  id: string
  task_id: string
  student_name: string
  class_label: string
  solution_md: string
  /** Путь относительно API, не абсолютный URL — прогонять через `fileUrl`. */
  image_url: string | null
  status: SubmissionStatus
  teacher_comment: string | null
  created_at: string
}

export type WeeklySubmissionAdminDTO = WeeklySubmissionDTO & {
  student_id: string | null
}

/** Превращает относительный путь из DTO в адрес, который поймёт <img src>. */
export function fileUrl(path: string): string {
  return `${BASE}${path}`
}

export type WeeklyTaskPublicDTO = {
  id: string
  title: string
  body_md: string
}

export type WeeklyLevel = 'school' | 'olympiad' | 'hard'

export const adminWeekly = {
  list: (token: string) => apiJson<WeeklyTaskDTO[]>('/admin/weekly', { method: 'GET', token }),
  get: (token: string, id: string) =>
    apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}`, { method: 'GET', token }),
  create: (
    token: string,
    body: { title: string; body_md: string; answer_md: string },
  ) => apiJson<WeeklyTaskDTO>('/admin/weekly', { method: 'POST', token, body }),
  generate: (
    token: string,
    body: {
      topic: string
      source_key?: string | null
      level?: WeeklyLevel
      allow_without_source?: boolean
      use_materials?: boolean
      hint?: string
    },
  ) => apiJson<WeeklyTaskDTO>('/admin/weekly/generate', { method: 'POST', token, body }),
  /** Доработка задачи по замечанию: условие и решение переписываются вместе. */
  refine: (token: string, id: string, instruction: string, level: WeeklyLevel = 'olympiad') =>
    apiJson<WeeklyTaskDTO>(`/admin/weekly/${id}/refine`, {
      method: 'POST',
      token,
      body: { instruction, level },
    }),
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
  submissions: (token: string, taskId: string) =>
    apiJson<WeeklySubmissionAdminDTO[]>(`/admin/weekly/${taskId}/submissions`, {
      method: 'GET',
      token,
    }),
  review: (
    token: string,
    submissionId: string,
    body: { status?: SubmissionStatus; teacher_comment?: string | null },
  ) =>
    apiJson<WeeklySubmissionAdminDTO>(`/admin/weekly/submissions/${submissionId}`, {
      method: 'PATCH',
      token,
      body,
    }),
  deleteSubmission: (token: string, submissionId: string) =>
    apiJson<void>(`/admin/weekly/submissions/${submissionId}`, {
      method: 'DELETE',
      token,
    }),
}

export const publicWeekly = {
  /** Все задачи, которые учитель держит на сайте, в порядке добавления. */
  published: () => apiJson<WeeklyTaskPublicDTO[]>('/weekly', { method: 'GET' }),

  /** Отправка решения: текст, фото тетради или и то и другое. */
  async submit(
    taskId: string,
    body: { solution_md: string; student_name: string; file: File | null },
  ): Promise<WeeklySubmissionDTO> {
    const fd = new FormData()
    fd.append('solution_md', body.solution_md)
    fd.append('student_name', body.student_name)
    if (body.file) fd.append('file', body.file)
    const r = await fetch(`${BASE}/weekly/${taskId}/submissions`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    if (!r.ok) {
      let detail: string | undefined
      const ct = r.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const data = await r.json().catch(() => ({}))
        detail = (data as { detail?: string }).detail
      }
      // 413 отдаёт nginx, а не приложение — объясняем по-человечески
      if (r.status === 413) throw new Error('Фото слишком большое. Сожми или сфотографируй заново.')
      throw new Error(detail || humanError(r.status))
    }
    return (await r.json()) as WeeklySubmissionDTO
  },

  /** Своё решение и вердикт. null — не отправлял или зашёл без QR. */
  mine: (taskId: string) =>
    apiJson<WeeklySubmissionDTO | null>(`/weekly/${taskId}/submissions/mine`, {
      method: 'GET',
    }).catch(() => null),
}

// ====== Опросы и обратная связь ======

export type PollKind = 'choice' | 'text'

export type PollOptionDTO = { id: string; position: number; text: string }

export type PollDTO = {
  id: string
  title: string
  question_md: string
  kind: PollKind
  multiple: boolean
  allow_comment: boolean
  options: PollOptionDTO[]
  /** Этот ученик уже отвечал. У анонимов всегда false. */
  answered: boolean
}

export type PollAdminDTO = PollDTO & {
  is_published: boolean
  answers_count: number
}

export type PollAnswerDTO = {
  id: string
  poll_id: string
  option_ids: string[]
  comment: string
  created_at: string
}

export type OptionTallyDTO = {
  option_id: string
  text: string
  position: number
  votes: number
}

export type PollCommentDTO = {
  id: string
  student_name: string
  class_label: string
  comment: string
  created_at: string
}

export type PollResultsDTO = {
  poll_id: string
  total_answers: number
  tallies: OptionTallyDTO[]
  comments: PollCommentDTO[]
}

export const publicPolls = {
  list: () => apiJson<PollDTO[]>('/polls', { method: 'GET' }),
  answer: (
    id: string,
    body: { option_ids: string[]; comment: string; student_name: string },
  ) => apiJson<PollAnswerDTO>(`/polls/${id}/answer`, { method: 'POST', body }),
  /** null — не отвечал или зашёл без QR. */
  mine: (id: string) =>
    apiJson<PollAnswerDTO | null>(`/polls/${id}/mine`, { method: 'GET' }).catch(
      () => null,
    ),
}

export const adminPolls = {
  list: (token: string) => apiJson<PollAdminDTO[]>('/admin/polls', { method: 'GET', token }),
  get: (token: string, id: string) =>
    apiJson<PollAdminDTO>(`/admin/polls/${id}`, { method: 'GET', token }),
  create: (
    token: string,
    body: {
      title: string
      question_md: string
      kind: PollKind
      multiple: boolean
      allow_comment: boolean
      options: string[]
    },
  ) => apiJson<PollAdminDTO>('/admin/polls', { method: 'POST', token, body }),
  update: (
    token: string,
    id: string,
    body: {
      title?: string
      question_md?: string
      multiple?: boolean
      allow_comment?: boolean
      options?: string[]
    },
  ) => apiJson<PollAdminDTO>(`/admin/polls/${id}`, { method: 'PATCH', token, body }),
  publish: (token: string, id: string) =>
    apiJson<PollAdminDTO>(`/admin/polls/${id}/publish`, { method: 'POST', token }),
  unpublish: (token: string, id: string) =>
    apiJson<PollAdminDTO>(`/admin/polls/${id}/unpublish`, { method: 'POST', token }),
  results: (token: string, id: string) =>
    apiJson<PollResultsDTO>(`/admin/polls/${id}/results`, { method: 'GET', token }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/polls/${id}`, { method: 'DELETE', token }),
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

export type StudentWeeklyDTO = {
  id: string
  task_id: string
  task_title: string
  solution_md: string
  /** Путь относительно API — прогонять через `fileUrl`. */
  image_url: string | null
  status: SubmissionStatus
  teacher_comment: string | null
  created_at: string
}

export type StudentPollAnswerDTO = {
  id: string
  poll_id: string
  poll_title: string
  chosen: string[]
  comment: string
  created_at: string
}

export const studentAuth = {
  activate: (token: string) =>
    apiJson<StudentPublicDTO>('/students/activate', {
      method: 'POST',
      body: { token },
    }).then((student) => { resetAnalyticsIdentity(); return student }),
  me: () =>
    apiJson<StudentPublicDTO | null>('/students/me', { method: 'GET' }).catch(
      () => null,
    ),
  logout: () => apiJson<void>('/students/logout', { method: 'POST' }).then(resetAnalyticsIdentity),
  myAttempts: () =>
    apiJson<StudentAttemptDTO[]>('/students/me/attempts', { method: 'GET' }),
  myWeekly: () =>
    apiJson<StudentWeeklyDTO[]>('/students/me/weekly', { method: 'GET' }),
  myPolls: () =>
    apiJson<StudentPollAnswerDTO[]>('/students/me/polls', { method: 'GET' }),
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

// ====== Библиотека: «Математика вокруг нас», олимпиады, ОГЭ, ЕГЭ ======

/** Набор полок фиксирован на бэкенде (domain/library/types.py). */
export type LibraryCollection = 'around' | 'olympiad' | 'oge' | 'ege'
export type LibraryKind = 'article' | 'link' | 'file'
/** section — открыли полку, остальное — конкретный материал. */
export type LibraryAction = 'section' | 'open' | 'link' | 'file'

export type LibraryCollectionDTO = {
  slug: LibraryCollection
  title: string
  subtitle: string
  count: number
}

export type LibraryItemPublicDTO = {
  id: string
  collection: LibraryCollection
  kind: LibraryKind
  slug: string
  title: string
  summary: string
  url: string
  /** Путь относительно API — прогонять через `fileUrl`. */
  file_url: string | null
  file_name: string
  file_size: number
  media_type: string
  has_body: boolean
}

export type LibraryItemDetailDTO = LibraryItemPublicDTO & { body_md: string }

export type LibraryItemDTO = LibraryItemDetailDTO & {
  is_published: boolean
  position: number
  material_id: string | null
  /** Статус индексации PDF. null — файла в материалах нет. */
  material_status: MaterialStatus | null
  chunks_count: number
  views: number
  created_at: string
}

export type LibraryItemStatDTO = {
  item_id: string
  title: string
  collection: LibraryCollection
  kind: LibraryKind
  is_published: boolean
  views: number
  students: number
  last_view: string | null
}

export type LibraryStudentStatDTO = {
  student_id: string
  student_name: string
  class_label: string
  views: number
  last_view: string | null
}

export type LibraryEventDTO = {
  id: string
  item_id: string | null
  item_title: string
  collection: LibraryCollection
  action: LibraryAction
  student_id: string | null
  student_name: string
  class_label: string
  created_at: string
}

export type LibraryStatsDTO = {
  views: number
  students: number
  views_week: number
  anonymous: number
  items: LibraryItemStatDTO[]
  top_students: LibraryStudentStatDTO[]
  recent: LibraryEventDTO[]
}

export const publicLibrary = {
  collections: () =>
    apiJson<LibraryCollectionDTO[]>('/library/collections', { method: 'GET' }),
  items: (collection: string) =>
    apiJson<LibraryItemPublicDTO[]>(`/library/collections/${collection}/items`, {
      method: 'GET',
    }),
  item: (collection: string, slug: string) =>
    apiJson<LibraryItemDetailDTO>(
      `/library/collections/${collection}/items/${encodeURIComponent(slug)}`,
      { method: 'GET' },
    ),
  /**
   * Отметка просмотра. Молча глотаем ошибку: счётчик — не то, ради чего
   * стоит показывать ученику красную плашку.
   */
  track: (body: { collection: string; action: LibraryAction; item_id?: string | null }) =>
    apiJson<void>('/library/events', { method: 'POST', body }).catch(() => {}),
}

export const adminLibrary = {
  list: (token: string, collection?: string) => {
    const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
    return apiJson<LibraryItemDTO[]>(`/admin/library${qs}`, { method: 'GET', token })
  },
  create: (
    token: string,
    body: {
      collection: string
      kind: 'article' | 'link'
      title: string
      summary?: string
      body_md?: string
      url?: string
    },
  ) => apiJson<LibraryItemDTO>('/admin/library', { method: 'POST', token, body }),
  /** Файл на полку. PDF заодно уходит в индексацию и в источники генерации. */
  async upload(
    token: string,
    body: { collection: string; title: string; summary: string; file: File },
  ): Promise<LibraryItemDTO> {
    const fd = new FormData()
    fd.append('file', body.file)
    fd.append('collection', body.collection)
    fd.append('title', body.title)
    fd.append('summary', body.summary)
    const r = await fetch(`${BASE}/admin/library/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: fd,
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      // 413 отдаёт nginx, а не приложение — объясняем по-человечески
      if (r.status === 413) {
        throw new Error('Сервер не принял файл такого размера. Нужен лимит в nginx.')
      }
      throw new Error((data as { detail?: string }).detail || `upload ${r.status}`)
    }
    return (await r.json()) as LibraryItemDTO
  },
  update: (
    token: string,
    id: string,
    body: {
      title?: string
      summary?: string
      body_md?: string
      url?: string
      collection?: string
    },
  ) => apiJson<LibraryItemDTO>(`/admin/library/${id}`, { method: 'PATCH', token, body }),
  publish: (token: string, id: string) =>
    apiJson<LibraryItemDTO>(`/admin/library/${id}/publish`, { method: 'POST', token }),
  unpublish: (token: string, id: string) =>
    apiJson<LibraryItemDTO>(`/admin/library/${id}/unpublish`, { method: 'POST', token }),
  /** Новый порядок полки целиком: стрелки в списке двигают локально и шлют всё. */
  reorder: (token: string, collection: string, ids: string[]) =>
    apiJson<LibraryItemDTO[]>('/admin/library/reorder', {
      method: 'POST',
      token,
      body: { collection, ids },
    }),
  delete: (token: string, id: string) =>
    apiJson<void>(`/admin/library/${id}`, { method: 'DELETE', token }),
  stats: (token: string, collection?: string) => {
    const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
    return apiJson<LibraryStatsDTO>(`/admin/library/stats${qs}`, { method: 'GET', token })
  },
}

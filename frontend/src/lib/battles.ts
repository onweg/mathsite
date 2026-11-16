import { apiJson, BASE } from './api'

export type Reviewer = 'teacher' | 'author' | 'ai'
export const reviewerNames: Record<Reviewer, string> = { teacher: 'Учитель', author: 'Автор задачи', ai: 'Нейросеть' }
export type BattleRound = { id: string; title: string; description: string; reviewers: Reviewer[]; submission_format: 'text' | 'photos'; task_deadline: string; solve_deadline: string; status: 'draft' | 'open' | 'grading' | 'closed'; is_visible: boolean }
export type RoundInput = Omit<BattleRound, 'id' | 'status' | 'is_visible'>
export type TaskInput = { title: string; question: string; practical_use: string; reference: string; question_images?: string[]; reference_images?: string[] }
export type BattleTask = Omit<TaskInput, 'reference' | 'reference_images'> & { reference?: string; reference_images?: string[]; id: string; revision: number; status: 'draft' | 'pending' | 'published'; author_name: string; own: boolean; likes: number; liked: boolean; has_answers: boolean; moderation_note: string }
export type BattleGrade = { reasoning: number; calculations: number; context: number; feedback: string; corrected_by_teacher?: boolean; correction_reason?: string }
export type BattleAttempt = { id: string; task_id: string; own: boolean; snapshot: Omit<TaskInput, 'reference' | 'reference_images'> & { reference?: string; reference_images?: string[] }; answer: string; images: string[]; ai_status: 'disabled' | 'queued' | 'checking' | 'failed' | 'graded'; student_name: string | null; reviews: Partial<Record<Reviewer, BattleGrade>>; review_history: Partial<Record<Reviewer, { data: BattleGrade; at: string }[]>>; score: number | null; can_review: boolean; created_at: string }
export type Rank = { student_id: string; name: string; class_label: string; score: number; place: number; count?: number; average?: number; title?: string }
export type BattleDetail = { round: BattleRound; tasks: BattleTask[]; attempts: BattleAttempt[]; rankings: { authors: Rank[]; solvers: Rank[]; pending: number }; can_author: boolean; can_solve: boolean }

export function battlesApi(token?: string) {
  const root = token ? '/admin/battles' : '/battles'
  return {
    list: () => apiJson<BattleRound[]>(root, { method: 'GET', token }),
    detail: (id: string) => apiJson<BattleDetail>(`${root}/${id}`, { method: 'GET', token }),
    saveRound: (body: RoundInput, id?: string) => apiJson<BattleRound>(`${root}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', token, body }),
    transition: (id: string, action: 'start' | 'stop' | 'finalize') => apiJson(`${root}/${id}/${action}`, { method: 'POST', token }),
    publication: (id: string, published: boolean) => apiJson(`${root}/${id}/publication`, { method: 'PUT', token, body: { published } }),
    delete: (id: string) => apiJson(`${root}/${id}`, { method: 'DELETE', token }),
    taskStatus: (rid: string, tid: string, action: string, note = '') => apiJson(`${root}/${rid}/tasks/${tid}/status`, { method: 'POST', token, body: { action, note } }),
    saveTask: (rid: string, body: TaskInput) => apiJson(`/battles/${rid}/my-task`, { method: 'PUT', body }),
    like: (rid: string, tid: string, enabled: boolean) => apiJson(`/battles/${rid}/tasks/${tid}/like`, { method: 'PUT', body: { enabled } }),
    answer: (rid: string, task: BattleTask, answer: string, images: string[] = []) => apiJson(`/battles/${rid}/tasks/${task.id}/answer`, { method: 'POST', body: { revision: task.revision, answer, images } }),
    review: (rid: string, aid: string, role: Reviewer, grade: BattleGrade, reason: string) => apiJson(`${root}/${rid}/attempts/${aid}/review`, { method: 'PUT', token, body: token ? { role, grade, reason } : grade }),
    retry: (rid: string, aid: string) => apiJson(`${root}/${rid}/attempts/${aid}/retry`, { method: 'POST', token }),
  }
}

export async function uploadBattlePhoto(rid: string, purpose: 'question' | 'reference' | 'answer', file: File, taskId?: string): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Фото больше 8 МБ. Уменьшите размер файла')
  const body = new FormData()
  body.append('file', file)
  const query = new URLSearchParams({ purpose, ...(taskId ? { task_id: taskId } : {}) })
  const response = await fetch(`${BASE}/battles/${rid}/photos?${query}`, { method: 'POST', credentials: 'include', body })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Не удалось загрузить фото. Попробуйте ещё раз')
  }
  return (await response.json()).id
}

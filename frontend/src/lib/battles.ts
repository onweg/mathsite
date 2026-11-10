import { apiJson } from './api'

export type Reviewer = 'teacher' | 'author' | 'ai'
export const reviewerNames: Record<Reviewer, string> = { teacher: 'Учитель', author: 'Автор задачи', ai: 'Нейросеть' }
export type BattleRound = { id: string; title: string; description: string; reviewers: Reviewer[]; task_deadline: string; solve_deadline: string; status: 'draft' | 'open' | 'grading' | 'closed' }
export type RoundInput = Omit<BattleRound, 'id' | 'status'>
export type TaskInput = { title: string; question: string; practical_use: string; reference: string }
export type BattleTask = Omit<TaskInput, 'reference'> & { reference?: string; id: string; revision: number; status: 'draft' | 'pending' | 'published'; author_name: string; own: boolean; likes: number; liked: boolean; has_answers: boolean; moderation_note: string }
export type BattleGrade = { reasoning: number; calculations: number; context: number; feedback: string; corrected_by_teacher?: boolean; correction_reason?: string }
export type BattleAttempt = { id: string; task_id: string; own: boolean; snapshot: Omit<TaskInput, 'reference'> & { reference?: string }; answer: string; ai_status: 'disabled' | 'queued' | 'checking' | 'failed' | 'graded'; student_name: string | null; reviews: Partial<Record<Reviewer, BattleGrade>>; review_history: Partial<Record<Reviewer, { data: BattleGrade; at: string }[]>>; score: number | null; can_review: boolean; created_at: string }
export type Rank = { student_id: string; name: string; class_label: string; score: number; place: number; count?: number; average?: number; title?: string }
export type BattleDetail = { round: BattleRound; tasks: BattleTask[]; attempts: BattleAttempt[]; rankings: { authors: Rank[]; solvers: Rank[]; pending: number }; can_author: boolean; can_solve: boolean }

export function battlesApi(token?: string) {
  const root = token ? '/admin/battles' : '/battles'
  return {
    list: () => apiJson<BattleRound[]>(root, { method: 'GET', token }),
    detail: (id: string) => apiJson<BattleDetail>(`${root}/${id}`, { method: 'GET', token }),
    saveRound: (body: RoundInput, id?: string) => apiJson<BattleRound>(`${root}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', token, body }),
    transition: (id: string, action: 'start' | 'stop' | 'finalize') => apiJson(`${root}/${id}/${action}`, { method: 'POST', token }),
    taskStatus: (rid: string, tid: string, action: string, note = '') => apiJson(`${root}/${rid}/tasks/${tid}/status`, { method: 'POST', token, body: { action, note } }),
    saveTask: (rid: string, body: TaskInput) => apiJson(`/battles/${rid}/my-task`, { method: 'PUT', body }),
    like: (rid: string, tid: string, enabled: boolean) => apiJson(`/battles/${rid}/tasks/${tid}/like`, { method: 'PUT', body: { enabled } }),
    answer: (rid: string, task: BattleTask, answer: string) => apiJson(`/battles/${rid}/tasks/${task.id}/answer`, { method: 'POST', body: { revision: task.revision, answer } }),
    review: (rid: string, aid: string, role: Reviewer, grade: BattleGrade, reason: string) => apiJson(`${root}/${rid}/attempts/${aid}/review`, { method: 'PUT', token, body: token ? { role, grade, reason } : grade }),
    retry: (rid: string, aid: string) => apiJson(`${root}/${rid}/attempts/${aid}/retry`, { method: 'POST', token }),
  }
}

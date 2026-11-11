import { apiJson } from './api'

export type Solution = { id: string; body_md: string; is_correct?: boolean; error_explanation?: string }
export type SolutionTask = { id: string; revision: number; status: 'draft' | 'published'; title: string; topic: string; difficulty: 'easy' | 'medium' | 'hard'; question_md: string; solutions: Solution[] }
export type SolutionSummary = Pick<SolutionTask, 'id' | 'title' | 'topic' | 'difficulty'> & { attempted: boolean }
export type SolutionAttempt = {
  id: string; task_id: string; title: string; question_md: string
  status: 'queued' | 'checking' | 'graded' | 'failed'; created_at: string
  answer: { selected_id: string; explanations: Record<string, string> }
  solutions: Solution[]
  ai_result: { score: number; total: number; choice_correct: boolean; choice_points: number; items: { solution_id: string; points: number | null; feedback: string }[] } | null
  teacher_result: { score: number; feedback: string } | null
  student_name?: string; class_label?: string; tries?: number; model_version?: string
}
export type ExerciseInput = Omit<SolutionTask, 'id' | 'revision' | 'status'>

export const solutionChecks = {
  list: () => apiJson<SolutionSummary[]>('/solution-checks'),
  get: (id: string) => apiJson<SolutionTask>(`/solution-checks/${id}`),
  submit: (id: string, body: { revision: number; selected_id: string; solution_order: string[]; explanations: Record<string, string> }) => apiJson<SolutionAttempt>(`/solution-checks/${id}/attempt`, { method: 'POST', body }),
  history: () => apiJson<SolutionAttempt[]>('/solution-checks/me'),
  attempt: (id: string) => apiJson<SolutionAttempt>(`/solution-checks/me/${id}`),
}
export const adminSolutionChecks = {
  list: (token: string) => apiJson<SolutionTask[]>('/admin/solution-checks', { token, method: 'GET' }),
  generate: (token: string, body: { topic: string; difficulty: string; hint: string }) => apiJson<SolutionTask>('/admin/solution-checks/generate', { token, method: 'POST', body }),
  save: (token: string, body: ExerciseInput, id?: string) => apiJson<SolutionTask>(`/admin/solution-checks${id ? '/' + id : ''}`, { token, method: id ? 'PUT' : 'POST', body }),
  publish: (token: string, id: string) => apiJson<SolutionTask>(`/admin/solution-checks/${id}/publish`, { token, method: 'POST', body: { reviewed: true } }),
  unpublish: (token: string, id: string) => apiJson<SolutionTask>(`/admin/solution-checks/${id}/unpublish`, { token, method: 'POST' }),
  delete: (token: string, id: string) => apiJson(`/admin/solution-checks/${id}`, { token, method: 'DELETE' }),
  attempts: (token: string, id: string) => apiJson<SolutionAttempt[]>(`/admin/solution-checks/${id}/attempts`, { token, method: 'GET' }),
  grade: (token: string, id: string, body: { score: number; feedback: string }) => apiJson<SolutionAttempt>(`/admin/solution-checks/attempts/${id}/grade`, { token, method: 'PUT', body }),
  retry: (token: string, id: string) => apiJson<SolutionAttempt>(`/admin/solution-checks/attempts/${id}/retry`, { token, method: 'POST' }),
}

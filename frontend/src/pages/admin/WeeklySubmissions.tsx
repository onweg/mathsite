import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import {
  SubmissionStatus,
  WeeklySubmissionAdminDTO,
  WeeklyTaskDTO,
  adminWeekly,
  fileUrl,
} from '../../lib/api'

const VERDICTS: { value: SubmissionStatus; label: string; active: string }[] = [
  { value: 'correct', label: 'верно', active: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200' },
  { value: 'partial', label: 'почти', active: 'border-sky-400/70 bg-sky-500/15 text-sky-200' },
  { value: 'wrong', label: 'неверно', active: 'border-red-400/60 bg-red-500/15 text-red-200' },
  { value: 'new', label: 'вернуть в непроверенные', active: 'border-amber-400/60 bg-amber-500/15 text-amber-200' },
]

export function WeeklySubmissions({
  token,
  task,
  onBack,
}: {
  token: string
  task: WeeklyTaskDTO
  onBack: () => void
}) {
  const [items, setItems] = useState<WeeklySubmissionAdminDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setItems(await adminWeekly.submissions(token, task.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [task.id])

  const unchecked = items?.filter((s) => s.status === 'new').length ?? 0

  return (
    <div className="space-y-5">
      <button onClick={onBack} className={backBtn}>
        Назад к задачам
      </button>

      <div>
        <h2 className="text-lg text-paper-50 font-serif">Решения · {task.title}</h2>
        <p className="text-sm text-paper-50/50 mt-1">
          {items === null
            ? 'загрузка…'
            : items.length === 0
              ? 'пока никто не прислал решение'
              : `всего ${items.length}, непроверенных ${unchecked}`}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-4">
          {items.map((s) => (
            <SubmissionRow
              key={s.id}
              token={token}
              submission={s}
              onChanged={(next) =>
                setItems((prev) =>
                  prev?.map((x) => (x.id === next.id ? next : x)) ?? prev,
                )
              }
              onDeleted={() =>
                setItems((prev) => prev?.filter((x) => x.id !== s.id) ?? prev)
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SubmissionRow({
  token,
  submission,
  onChanged,
  onDeleted,
}: {
  token: string
  submission: WeeklySubmissionAdminDTO
  onChanged: (s: WeeklySubmissionAdminDTO) => void
  onDeleted: () => void
}) {
  const [comment, setComment] = useState(submission.teacher_comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)

  // Вердикт сохраняем сразу вместе с текущим текстом комментария: учитель
  // жмёт одну кнопку, а не «сохранить» отдельно.
  async function setVerdict(status: SubmissionStatus) {
    setBusy(true)
    setError(null)
    try {
      onChanged(
        await adminWeekly.review(token, submission.id, {
          status,
          teacher_comment: comment.trim() || null,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не сохранилось')
    } finally {
      setBusy(false)
    }
  }

  async function saveComment() {
    setBusy(true)
    setError(null)
    try {
      onChanged(
        await adminWeekly.review(token, submission.id, {
          teacher_comment: comment.trim() || null,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не сохранилось')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Удалить решение «${submission.student_name}»?`)) return
    setBusy(true)
    try {
      await adminWeekly.deleteSubmission(token, submission.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалилось')
      setBusy(false)
    }
  }

  const sent = new Date(submission.created_at).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <li className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-paper-50">{submission.student_name}</span>
          {submission.class_label && (
            <span className="ml-2 text-xs text-paper-50/40">{submission.class_label}</span>
          )}
          {!submission.student_id && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-paper-50/30">
              без QR
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-paper-50/35">{sent}</span>
          <StatusBadge status={submission.status} />
        </div>
      </div>

      {submission.solution_md && (
        <div className="rounded-lg bg-ink-950/50 px-4 py-3 text-sm text-paper-50/85">
          <Markdown text={submission.solution_md} />
        </div>
      )}

      {submission.image_url && (
        <button onClick={() => setZoom((z) => !z)} className="block">
          {/* высота задана коробке: у <img> до загрузки она нулевая,
              и список прыгал по мере подгрузки фотографий */}
          <div className={zoom ? 'h-[80vh]' : 'h-56'}>
            <img
              src={fileUrl(submission.image_url)}
              alt={`Решение: ${submission.student_name}`}
              className="h-full w-auto max-w-full rounded-lg border border-paper-50/10 object-contain"
            />
          </div>
          <span className="mt-1 block text-[10px] uppercase tracking-wider text-paper-50/30">
            {zoom ? 'свернуть' : 'нажми, чтобы увеличить'}
          </span>
        </button>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if ((submission.teacher_comment ?? '') !== comment.trim()) saveComment()
        }}
        rows={2}
        placeholder="Комментарий ученику — он увидит его на сайте"
        className="w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-sm text-paper-50 outline-none focus:border-paper-50/40"
      />

      <div className="flex flex-wrap items-center gap-2">
        {VERDICTS.filter((v) => v.value !== 'new' || submission.status !== 'new').map(
          (v) => (
            <button
              key={v.value}
              onClick={() => setVerdict(v.value)}
              disabled={busy}
              className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                submission.status === v.value
                  ? v.active
                  : 'border-paper-50/10 text-paper-50/60 hover:border-paper-50/30'
              }`}
            >
              {v.label}
            </button>
          ),
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto text-xs text-paper-50/30 hover:text-red-300 disabled:opacity-50"
        >
          удалить
        </button>
      </div>

      {error && <div className="text-sm text-red-400/90">{error}</div>}
    </li>
  )
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const map: Record<SubmissionStatus, [string, string]> = {
    new: ['на проверке', 'text-amber-300/90 bg-amber-400'],
    correct: ['верно', 'text-emerald-300 bg-emerald-400'],
    partial: ['почти', 'text-sky-300 bg-sky-400'],
    wrong: ['неверно', 'text-red-300/90 bg-red-400'],
  }
  const [label, cls] = map[status]
  const [text, dot] = cls.split(' ')
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs shrink-0 ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const backBtn =
  'text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1'

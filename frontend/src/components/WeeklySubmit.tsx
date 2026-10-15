import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  HonorEntryDTO,
  WeeklySubmissionDTO,
  fileUrl,
  publicWeekly,
} from '../lib/api'
import { anchorScroll } from '../hooks/useLenis'
import { useStudent } from '../lib/student'
import { Markdown } from './Markdown'

const NAME_KEY = 'mathsite.student.name'
const MAX_PHOTO_MB = 8

/**
 * Приём решения задачи недели.
 *
 * Ученик по QR переотправляет решение сколько угодно раз — каждая новая
 * отправка перезаписывает прежнюю и снова уходит на проверку. Аноним своё
 * решение потом уже не увидит: опознать его между заходами нечем, поэтому
 * ему прямо об этом говорим.
 */
export function WeeklySubmit({ taskId }: { taskId: string }) {
  const auth = useStudent()
  const authed = auth.status === 'authed'

  const [mine, setMine] = useState<WeeklySubmissionDTO | null>(null)
  const [honor, setHonor] = useState<HonorEntryDTO[]>([])
  const [open, setOpen] = useState(false)
  const [sentAnon, setSentAnon] = useState<WeeklySubmissionDTO | null>(null)

  // Форма и карточка разной высоты. Без якоря страница уезжает под блоком
  // в момент подмены — пользователь ничего не скроллил, а экран прыгнул.
  const boxRef = useRef<HTMLDivElement>(null)
  const restore = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    if (!restore.current) return
    restore.current()
    restore.current = null
  })

  useEffect(() => {
    publicWeekly.honor(taskId).then(setHonor)
  }, [taskId])

  useEffect(() => {
    if (!authed) {
      setMine(null)
      return
    }
    publicWeekly.mine(taskId).then(setMine)
  }, [taskId, authed])

  function afterSend(s: WeeklySubmissionDTO) {
    restore.current = anchorScroll(boxRef.current)
    setOpen(false)
    if (authed) setMine(s)
    else setSentAnon(s)
  }

  const current = mine ?? sentAnon

  return (
    <div ref={boxRef} className="mt-6 space-y-5">
      {current && !open && (
        <SubmissionCard
          submission={current}
          anonymous={!authed}
          onRedo={() => {
            restore.current = anchorScroll(boxRef.current)
            setOpen(true)
          }}
        />
      )}

      {!current && !open && (
        <button
          onClick={() => setOpen(true)}
          data-cursor="lg"
          data-cursor-label="Решить"
          className="group inline-flex items-center gap-3 rounded-full border border-paper-50/20 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 transition-colors hover:border-gold-500"
        >
          <span>Отправить решение</span>
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
        </button>
      )}

      {open && (
        <SubmitForm
          taskId={taskId}
          studentName={authed ? auth.student.name : null}
          previous={current}
          onCancel={() => setOpen(false)}
          onSent={afterSend}
        />
      )}

      <HonorBoard entries={honor} />
    </div>
  )
}

/* ---------- форма ---------- */

function SubmitForm({
  taskId,
  studentName,
  previous,
  onCancel,
  onSent,
}: {
  taskId: string
  studentName: string | null
  previous: WeeklySubmissionDTO | null
  onCancel: () => void
  onSent: (s: WeeklySubmissionDTO) => void
}) {
  const [text, setText] = useState(previous?.solution_md ?? '')
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY)?.trim() || '',
  )
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // objectURL живёт до смены файла — иначе течёт память
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function pickFile(f: File | null) {
    setError(null)
    if (f && f.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`Фото больше ${MAX_PHOTO_MB} МБ. Сфотографируй поменьше или сожми.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setFile(f)
  }

  const empty = !text.trim() && !file

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const cleanName = name.trim()
      if (!studentName && cleanName) localStorage.setItem(NAME_KEY, cleanName)
      const s = await publicWeekly.submit(taskId, {
        solution_md: text,
        student_name: cleanName,
        file,
      })
      onSent(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось отправить')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 rounded-3xl border border-paper-50/10 bg-ink-950/60 p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
          {previous ? 'переотправка решения' : 'твоё решение'}
        </div>
        <button
          onClick={onCancel}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/40 transition hover:text-paper-50"
        >
          отмена
        </button>
      </div>

      {studentName ? (
        <div className="text-sm text-paper-100/70">
          Отправляешь как <span className="text-gold-500">{studentName}</span>.
        </div>
      ) : (
        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50">
            как тебя зовут
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя и фамилия"
            className="w-full rounded-xl border border-paper-50/10 bg-ink-900/60 px-4 py-3 text-paper-50 outline-none transition focus:border-paper-50/40"
          />
          <span className="block text-[11px] leading-relaxed text-paper-50/40">
            Зашёл по своему QR-коду — имя подставится само, и ты увидишь, что
            ответил учитель. Без QR решение уйдёт, но проверку ты уже не увидишь.
          </span>
        </label>
      )}

      <label className="block space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50">
          решение текстом
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Распиши ход решения. Формулы можно писать как $x^2+1$."
          className="w-full resize-y rounded-xl border border-paper-50/10 bg-ink-900/60 px-4 py-3 font-mono text-sm leading-relaxed text-paper-50 outline-none transition focus:border-paper-50/40"
        />
      </label>

      <div className="space-y-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50">
          или фото тетради
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-paper-50/20 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-50/80 transition hover:border-gold-500 hover:text-paper-50"
          >
            {file ? 'другое фото' : 'выбрать фото'}
          </button>
          {file && (
            <button
              onClick={() => pickFile(null)}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/40 transition hover:text-red-300"
            >
              убрать
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {preview && (
          <div className="h-64">
            <img
              src={preview}
              alt="Предпросмотр фото решения"
              className="h-full w-auto max-w-full rounded-2xl border border-paper-50/10 object-contain"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button
          onClick={send}
          disabled={busy || empty}
          className="rounded-full bg-paper-50 px-7 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-950 transition disabled:opacity-40"
        >
          {busy ? 'отправляем…' : 'отправить'}
        </button>
        {empty && (
          <span className="text-[11px] text-paper-50/40">
            Нужен текст решения или фото — хоть что-то одно.
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------- то, что ученик видит после отправки ---------- */

const STATUS: Record<
  WeeklySubmissionDTO['status'],
  { label: string; className: string }
> = {
  new: { label: 'на проверке', className: 'text-amber-300/90' },
  correct: { label: 'верно', className: 'text-emerald-300' },
  partial: { label: 'почти', className: 'text-sky-300' },
  wrong: { label: 'пока неверно', className: 'text-red-300/90' },
}

function SubmissionCard({
  submission,
  anonymous,
  onRedo,
}: {
  submission: WeeklySubmissionDTO
  anonymous: boolean
  onRedo: () => void
}) {
  const s = STATUS[submission.status]
  return (
    <div className="space-y-4 rounded-3xl border border-paper-50/10 bg-ink-950/60 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
          решение отправлено
        </div>
        <div className={`font-mono text-[10px] uppercase tracking-[0.25em] ${s.className}`}>
          {s.label}
        </div>
      </div>

      {submission.solution_md && (
        <div className="text-sm leading-relaxed text-paper-100/80">
          <Markdown text={submission.solution_md} />
        </div>
      )}

      {submission.image_url && (
        // Высота коробки задана заранее: у <img> до загрузки она нулевая,
        // и в момент появления картинки страница дёргалась вниз.
        <div className="h-64">
          <img
            src={fileUrl(submission.image_url)}
            alt="Фото отправленного решения"
            className="h-full w-auto max-w-full rounded-2xl border border-paper-50/10 object-contain"
          />
        </div>
      )}

      {submission.teacher_comment && (
        <div className="rounded-2xl border border-gold-500/30 bg-gold-500/5 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500/80">
            учитель
          </div>
          <p className="mt-2 text-sm leading-relaxed text-paper-100/85">
            {submission.teacher_comment}
          </p>
        </div>
      )}

      {anonymous ? (
        <p className="text-[11px] leading-relaxed text-paper-50/40">
          Ты отправил решение без входа по QR — проверку учителя здесь увидеть
          не получится. Зайди по своему QR-коду, и следующая отправка попадёт в
          твой профиль.
        </p>
      ) : (
        <button
          onClick={onRedo}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50 transition hover:text-gold-500"
        >
          отправить заново
        </button>
      )}
    </div>
  )
}

/* ---------- доска почёта ---------- */

function HonorBoard({ entries }: { entries: HonorEntryDTO[] }) {
  if (entries.length === 0) return null
  return (
    <div className="space-y-3 pt-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-500/70">
        Доска почёта
      </div>
      <ul className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <li
            key={`${e.student_name}-${i}`}
            className="rounded-full border border-gold-500/25 bg-gold-500/5 px-4 py-1.5 text-sm text-paper-100/85"
          >
            {e.student_name}
            {e.class_label && (
              <span className="ml-2 text-paper-50/40">{e.class_label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useState } from 'react'

/**
 * Доработка черновика словами: «третий вопрос слишком лёгкий», «убери
 * геометрию», «добавь два вопроса на сокращение».
 *
 * Модель получает текущий черновик целиком и замечание, и переписывает то,
 * о чём попросили, — а не сочиняет всё заново. Поэтому кнопка называется
 * «доработать», а не «перегенерировать»: учителю не нужно вычитывать с нуля
 * то, что его уже устраивало.
 */
export function RefineBox({
  examples,
  note,
  disabled = false,
  onSubmit,
}: {
  examples: string[]
  note?: string
  disabled?: boolean
  onSubmit: (instruction: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const instruction = text.trim()
    if (instruction.length < 3) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(instruction)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось доработать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-paper-50/10 bg-ink-900/40 p-5">
      <h3 className="text-xs uppercase tracking-widest text-paper-50/50">
        доработать с нейросетью
      </h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        disabled={disabled || busy}
        placeholder={examples.join('\n')}
        className="w-full resize-y rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-sm text-paper-50 outline-none transition focus:border-paper-50/40 disabled:opacity-50"
      />
      {note && <p className="text-xs text-paper-50/40">{note}</p>}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400/90">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={send}
        disabled={disabled || busy || text.trim().length < 3}
        className="rounded-lg border border-paper-50/20 px-4 py-2 text-sm text-paper-50/80 transition hover:bg-paper-50/5 disabled:opacity-40"
      >
        {busy ? 'дорабатываем…' : 'доработать'}
      </button>
    </div>
  )
}

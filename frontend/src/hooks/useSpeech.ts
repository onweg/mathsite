import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Хук над Web Speech API. Один инстанс SpeechRecognition на компонент.
 * Поддержка: Chrome / Edge / Safari (включая мобильные). Firefox не поддерживает.
 *
 * Паттерн использования:
 *   const sr = useSpeech({ lang: 'ru-RU', onFinal: (t) => setInput(t) })
 *   <button onClick={() => sr.listening ? sr.stop() : sr.start()}>…</button>
 */

type Options = {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
  // вызывается при финальных кусках распознавания (речь закончена/пауза)
  onFinal?: (text: string) => void
}

type State = {
  supported: boolean
  listening: boolean
  interim: string
  final: string
  error: string | null
  start: () => void
  stop: () => void
  reset: () => void
}

// Браузерные API под префиксом webkit в Safari / старом Chrome.
// Сам тип SpeechRecognition — не в стандартном lib.dom.d.ts, поэтому any.
function getCtor(): any | null {
  if (typeof window === 'undefined') return null
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  )
}

export function useSpeech(opts: Options = {}): State {
  const { lang = 'ru-RU', continuous = false, interimResults = true, onFinal } = opts

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [final, setFinal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const Ctor = getCtor()
  const supported = !!Ctor
  const recRef = useRef<any>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  // ленивое создание инстанса
  const ensureRec = useCallback(() => {
    if (!Ctor) return null
    if (recRef.current) return recRef.current
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = interimResults
    rec.onresult = (e: any) => {
      let fin = ''
      let int = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const txt = r[0]?.transcript ?? ''
        if (r.isFinal) fin += txt
        else int += txt
      }
      if (fin) {
        setFinal((prev) => (prev + ' ' + fin).trim())
        setInterim('')
        onFinalRef.current?.(fin.trim())
      } else {
        setInterim(int)
      }
    }
    rec.onerror = (e: any) => {
      setError(e?.error ? String(e.error) : 'speech-error')
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    return rec
  }, [Ctor, lang, continuous, interimResults])

  const start = useCallback(() => {
    const rec = ensureRec()
    if (!rec) return
    setError(null)
    setInterim('')
    try {
      rec.start()
      setListening(true)
    } catch (e) {
      // start() бросает если уже активен — игнорируем
      setListening(true)
    }
  }, [ensureRec])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  const reset = useCallback(() => {
    setInterim('')
    setFinal('')
    setError(null)
  }, [])

  useEffect(() => () => recRef.current?.abort?.(), [])

  return { supported, listening, interim, final, error, start, stop, reset }
}

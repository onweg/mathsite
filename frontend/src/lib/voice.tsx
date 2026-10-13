import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Сквозной голосовой режим: один SpeechRecognition на всю страницу.
 *
 * Сценарий урока:
 *   ученик из любого места говорит «ИИ, вопрос» → страница сама прокручивается
 *   к ИИ-теоретику, дальше всё сказанное попадает в поле ввода, а «ИИ, ответь»
 *   отправляет вопрос.
 *
 * Почему один инстанс на всё приложение: Chrome устойчиво держит только одно
 * активное распознавание на вкладку. Поэтому локальные кнопки микрофона не
 * поднимают свой SpeechRecognition, а работают через этот же контроллер
 * (`startDictation`) либо просят паузу (`pause`/`resume`).
 */

type Mode = 'off' | 'wake' | 'dictating'

/** Поле ввода, которым управляет голос. Сейчас это чат ИИ-теоретика. */
export type VoiceTarget = {
  /** дописать распознанный кусок к тому, что уже набрано */
  append: (text: string) => void
  /** отправить набранное */
  submit: () => void
  /** показать поле пользователю: проскроллить и сфокусировать */
  focus?: () => void
}

type VoiceApi = {
  supported: boolean
  enabled: boolean
  mode: Mode
  interim: string
  error: string | null
  enable: () => void
  disable: () => void
  /** включить диктовку вручную — кнопкой микрофона, без якоря */
  startDictation: () => void
  cancelDictation: () => void
  /** приостановить на время работы чужого распознавателя */
  pause: () => void
  resume: () => void
  registerTarget: (t: VoiceTarget) => () => void
}

const STORAGE_KEY = 'mathsite.voice.enabled'
/** Сколько молчим в режиме диктовки, прежде чем вернуться к ожиданию якоря. */
const IDLE_MS = 20_000
/** Chrome сам обрывает распознавание — поднимаем обратно с небольшой паузой. */
const RESTART_MS = 150

/* ---------- Разбор якорей ---------- */

/** Приводим к нижнему регистру без потери длины строки — индексы совпадают с оригиналом. */
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
}

/**
 * «ИИ» Chrome распознаёт по-разному: «ии», «и и», «аи», «эй ай».
 * Поэтому держим несколько написаний, но обязательно вместе со словом-командой —
 * иначе на уроке якорь будет срабатывать от любого «и».
 */
const WAKE_RE =
  /(?:^|\s)(?:и\s?и|и{2,}|аи|ai|ия|эй|ей|ай)\s*[,.!?…–—-]*\s*(?:вопрос[а-я]*|спроси[а-я]*)/
const SEND_RE =
  /(?:^|\s)(?:и\s?и\s*[,.!?…–—-]*\s*)?(?:ответь|отвечай|отправь|отправить|готово)\s*[.!?…]*\s*$/
const CANCEL_RE =
  /(?:^|\s)(?:и\s?и\s*[,.!?…–—-]*\s*)?(?:стоп|отмена|отмени|отменить)\s*[.!?…]*\s*$/

export function findWakePhrase(text: string): { tail: string } | null {
  const m = WAKE_RE.exec(norm(text))
  if (!m) return null
  const tail = text.slice(m.index + m[0].length).replace(/^[\s,.!?…:;–—-]+/, '').trim()
  return { tail }
}

/**
 * Срезает якорь в начале реплики.
 *
 * Отдельно от WAKE_RE: когда мы проснулись на промежуточном результате,
 * финальный кусок от Chrome может прийти уже без «ИИ» впереди — например
 * просто «Вопрос рациональные выражения». Без этой чистки слово «вопрос»
 * уезжало в текст вопроса.
 */
const LEADING_WAKE_RE =
  /^[\s,.!?…:;–—-]*(?:(?:и\s?и|и{2,}|аи|ai|ия|эй|ей|ай)[\s,.!?…:;–—-]*)?(?:вопрос[а-я]*|спроси[а-я]*)[\s,.!?…:;–—-]*/

export function stripWakePrefix(text: string): string {
  const m = LEADING_WAKE_RE.exec(norm(text))
  if (!m || m[0].length === 0) return text.trim()
  return text.slice(m[0].length).trim()
}

export function findSendPhrase(text: string): { body: string } | null {
  const m = SEND_RE.exec(norm(text))
  if (!m) return null
  return { body: text.slice(0, m.index).trim() }
}

export function isCancelPhrase(text: string): boolean {
  return CANCEL_RE.test(norm(text))
}

/* ---------- Контроллер ---------- */

function getCtor(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

const VoiceCtx = createContext<VoiceApi | null>(null)

export function VoiceProvider({ children }: { children: ReactNode }) {
  const Ctor = useMemo(getCtor, [])
  const supported = !!Ctor

  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<Mode>('off')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<any>(null)
  /** Якорь поймали на interim — значит в финальном куске его надо срезать. */
  const pendingWakeRef = useRef(false)
  const enabledRef = useRef(false)
  const modeRef = useRef<Mode>('off')
  const pausedRef = useRef(false)
  const targetRef = useRef<VoiceTarget | null>(null)
  const idleRef = useRef<number | null>(null)

  const setModeBoth = useCallback((m: Mode) => {
    modeRef.current = m
    setMode(m)
  }, [])

  const clearIdle = useCallback(() => {
    if (idleRef.current !== null) {
      window.clearTimeout(idleRef.current)
      idleRef.current = null
    }
  }, [])

  const endDictation = useCallback(() => {
    pendingWakeRef.current = false
    clearIdle()
    setInterim('')
    setModeBoth(enabledRef.current ? 'wake' : 'off')
  }, [clearIdle, setModeBoth])

  const armIdle = useCallback(() => {
    clearIdle()
    // Набранный текст не теряем — просто перестаём слушать продолжение.
    idleRef.current = window.setTimeout(endDictation, IDLE_MS)
  }, [clearIdle, endDictation])

  const beginDictation = useCallback(() => {
    setModeBoth('dictating')
    targetRef.current?.focus?.()
    armIdle()
  }, [armIdle, setModeBoth])

  const consume = useCallback(
    (chunk: string) => {
      if (isCancelPhrase(chunk)) {
        endDictation()
        return
      }
      const send = findSendPhrase(chunk)
      if (send) {
        if (send.body) targetRef.current?.append(send.body)
        endDictation()
        targetRef.current?.submit()
        return
      }
      targetRef.current?.append(chunk)
      armIdle()
    },
    [armIdle, endDictation],
  )

  const handleFinal = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) return

      if (modeRef.current === 'dictating') {
        let chunk = text
        if (pendingWakeRef.current) {
          pendingWakeRef.current = false
          // Тот же кусок речи, по которому мы уже проснулись: сам якорь в вопрос не пишем.
          const w = findWakePhrase(chunk)
          chunk = w ? w.tail : stripWakePrefix(chunk)
        }
        if (chunk) consume(chunk)
        return
      }
      const wake = findWakePhrase(text)
      if (!wake) return
      beginDictation()
      // «ИИ, вопрос, как решать квадратные уравнения» — хвост сразу в поле.
      if (wake.tail) consume(wake.tail)
    },
    [beginDictation, consume],
  )

  const startRec = useCallback(() => {
    if (!Ctor || !enabledRef.current || pausedRef.current) return
    let rec = recRef.current
    if (!rec) {
      rec = new Ctor()
      rec.lang = 'ru-RU'
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e: any) => {
        let fin = ''
        let int = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          const txt = r[0]?.transcript ?? ''
          if (r.isFinal) fin += txt
          else int += txt
        }
        setInterim(int)
        // Реакция на якорь — сразу, не дожидаясь финализации фразы.
        if (int && modeRef.current === 'wake' && findWakePhrase(int)) {
          pendingWakeRef.current = true
          beginDictation()
        }
        if (fin) handleFinal(fin)
      }
      rec.onerror = (e: any) => {
        const code = e?.error ? String(e.error) : 'speech-error'
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          // Доступ к микрофону запрещён — перезапуск не поможет, гасим режим.
          enabledRef.current = false
          setEnabled(false)
          setModeBoth('off')
          setError('Нет доступа к микрофону. Разреши его в настройках сайта в Chrome.')
          try {
            localStorage.removeItem(STORAGE_KEY)
          } catch {
            /* приватный режим — не страшно */
          }
        }
        // остальное (no-speech, aborted, network) лечится перезапуском в onend
      }
      rec.onend = () => {
        setInterim('')
        if (enabledRef.current && !pausedRef.current) {
          window.setTimeout(() => startRec(), RESTART_MS)
        }
      }
      recRef.current = rec
    }
    try {
      rec.start()
    } catch {
      // start() бросает, если распознавание уже идёт — это нормально
    }
  }, [Ctor, beginDictation, handleFinal, setModeBoth])

  const enable = useCallback(() => {
    if (!supported) return
    setError(null)
    enabledRef.current = true
    setEnabled(true)
    setModeBoth('wake')
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* приватный режим */
    }
    startRec()
  }, [setModeBoth, startRec, supported])

  const disable = useCallback(() => {
    enabledRef.current = false
    setEnabled(false)
    clearIdle()
    setModeBoth('off')
    setInterim('')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* приватный режим */
    }
    try {
      recRef.current?.stop()
    } catch {
      /* уже остановлен */
    }
  }, [clearIdle, setModeBoth])

  const pause = useCallback(() => {
    pausedRef.current = true
    try {
      recRef.current?.stop()
    } catch {
      /* уже остановлен */
    }
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    if (enabledRef.current) startRec()
  }, [startRec])

  const startDictation = useCallback(() => {
    if (!enabledRef.current) enable()
    beginDictation()
  }, [beginDictation, enable])

  const registerTarget = useCallback((t: VoiceTarget) => {
    targetRef.current = t
    return () => {
      if (targetRef.current === t) targetRef.current = null
    }
  }, [])

  // Второй заход на сайт: если голос уже включали и микрофон разрешён —
  // поднимаем режим молча, без повторного запроса прав.
  useEffect(() => {
    if (!supported) return
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      return
    }
    if (stored !== '1') return
    const perms = (navigator as any).permissions
    if (!perms?.query) return
    perms
      .query({ name: 'microphone' })
      .then((p: any) => {
        if (p.state === 'granted') enable()
      })
      .catch(() => {
        /* Chrome без поддержки запроса прав — ждём клика по кнопке */
      })
  }, [enable, supported])

  useEffect(
    () => () => {
      enabledRef.current = false
      try {
        recRef.current?.abort?.()
      } catch {
        /* уже мёртв */
      }
    },
    [],
  )

  const api: VoiceApi = {
    supported,
    enabled,
    mode,
    interim,
    error,
    enable,
    disable,
    startDictation,
    cancelDictation: endDictation,
    pause,
    resume,
    registerTarget,
  }

  return (
    <VoiceCtx.Provider value={api}>
      {children}
      <VoiceOverlay api={api} />
    </VoiceCtx.Provider>
  )
}

export function useVoice(): VoiceApi {
  const ctx = useContext(VoiceCtx)
  if (!ctx) {
    throw new Error('useVoice вызван вне VoiceProvider')
  }
  return ctx
}

/* ---------- Индикатор ---------- */

function VoiceOverlay({ api }: { api: VoiceApi }) {
  if (!api.enabled && !api.error) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-full border border-paper-50/15 bg-ink-900/90 px-5 py-2.5 backdrop-blur">
        {api.error ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-rose-300">
            {api.error}
          </span>
        ) : api.mode === 'dictating' ? (
          <>
            <span className="relative inline-flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold-500">
              слушаю вопрос
            </span>
            <span className="truncate text-sm text-paper-50/80">
              {api.interim || 'говори…'}
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/40 md:inline">
              «ИИ, ответь» — отправить
            </span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper-50/60">
              скажи «ИИ, вопрос»
            </span>
          </>
        )}
      </div>
    </div>
  )
}

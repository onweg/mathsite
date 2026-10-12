import { motion } from 'framer-motion'

/**
 * Визуальная кнопка микрофона с индикацией прослушивания.
 * Делегирует состояние внешнему useSpeech-хуку — здесь только UI.
 */
export function MicButton({
  listening,
  supported,
  onToggle,
  interim = '',
  size = 'md',
  label,
}: {
  listening: boolean
  supported: boolean
  onToggle: () => void
  interim?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  if (!supported) {
    return (
      <button
        disabled
        title="Голосовой ввод не поддерживается в этом браузере"
        className="rounded-full border border-paper-50/10 bg-ink-900/50 p-2 text-paper-50/30 cursor-not-allowed"
      >
        <MicIcon muted />
      </button>
    )
  }

  const sizes = { sm: 'p-1.5', md: 'p-2.5', lg: 'p-3' }[size]

  return (
    <div className="inline-flex items-center gap-3">
      <motion.button
        type="button"
        onClick={onToggle}
        whileTap={{ scale: 0.9 }}
        className={[
          'relative rounded-full border transition',
          sizes,
          listening
            ? 'border-gold-500 bg-gold-500/15 text-gold-500 shadow-[0_0_0_6px_rgba(212,165,116,0.08)]'
            : 'border-paper-50/15 bg-ink-900/60 text-paper-50/70 hover:border-paper-50/40 hover:text-paper-50',
        ].join(' ')}
        title={listening ? 'идёт запись — нажми, чтобы остановить' : (label ?? 'голосовой ввод')}
        aria-label={listening ? 'остановить запись' : 'начать голосовой ввод'}
      >
        <MicIcon />
        {listening && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
        )}
      </motion.button>

      {listening && interim && (
        <span className="font-mono text-xs text-gold-500/80 truncate max-w-[220px]">
          {interim}…
        </span>
      )}
    </div>
  )
}

function MicIcon({ muted }: { muted?: boolean } = {}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

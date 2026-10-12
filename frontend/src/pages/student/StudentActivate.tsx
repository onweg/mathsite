import { useEffect, useState } from 'react'
import { studentAuth } from '../../lib/api'

/**
 * Magic-link `/s/<token>` — тонкая страница.
 * Отправляет токен на /students/activate; backend ставит HTTP-only cookie.
 * Успех → редирект на /me. Ошибка — приветливое сообщение + кнопка «на сайт».
 */
export function StudentActivate() {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    const path = window.location.pathname
    const token = path.replace(/^\/s\//, '').trim()
    if (!token) {
      setState('error')
      setMessage('нет токена в адресе')
      return
    }
    studentAuth
      .activate(token)
      .then((user) => {
        setState('success')
        setMessage(`Привет, ${user.name}!`)
        setTimeout(() => {
          window.location.replace('/me')
        }, 700)
      })
      .catch((e) => {
        setState('error')
        setMessage(e instanceof Error ? e.message : 'не удалось войти по этой ссылке')
      })
  }, [])

  return (
    <div className="min-h-screen bg-ink-950 text-paper-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="font-display text-5xl text-paper-50/90">
          {state === 'loading' && '…'}
          {state === 'success' && '✓'}
          {state === 'error' && '!'}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50">
          {state === 'loading' && 'проверяем ссылку'}
          {state === 'success' && 'входим в профиль'}
          {state === 'error' && 'ссылка не сработала'}
        </div>
        {message && <div className="text-paper-50/80">{message}</div>}
        {state === 'error' && (
          <a
            href="/"
            className="inline-block text-xs text-paper-50/60 hover:text-paper-50 border border-paper-50/15 rounded-full px-4 py-2"
          >
            Назад на сайт
          </a>
        )}
      </div>
    </div>
  )
}

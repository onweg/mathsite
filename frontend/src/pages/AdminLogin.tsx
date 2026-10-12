import { useState } from 'react'
import { login } from '../lib/api'
import { AdminUser } from '../lib/api'

export function AdminLogin({
  onSuccess,
}: {
  onSuccess: (user: AdminUser, token: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await login(email.trim(), password)
      onSuccess(r.user, r.access_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-950">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-ink-900/60 border border-paper-50/10 rounded-2xl p-8 space-y-5 backdrop-blur"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-serif tracking-wide text-paper-50">Админка учителя</h1>
          <p className="text-sm text-paper-50/50">Вход для управления сайтом</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider text-paper-50/60">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider text-paper-50/60">Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
          />
        </label>

        {error && (
          <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full bg-paper-50 text-ink-950 rounded-lg py-2 font-medium disabled:opacity-50 transition"
        >
          {busy ? 'входим…' : 'войти'}
        </button>

        <a href="/" className="block text-center text-xs text-paper-50/40 hover:text-paper-50/70">
          ← на сайт
        </a>
      </form>
    </div>
  )
}

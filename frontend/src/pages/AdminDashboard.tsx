import { useState } from 'react'
import { AdminUser } from '../lib/api'
import { QuizzesPage } from './admin/QuizzesPage'

type Tab = 'quizzes' | 'materials' | 'weekly'

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: 'quizzes', label: 'Квизы', ready: true },
  { id: 'materials', label: 'Материалы', ready: false },
  { id: 'weekly', label: 'Задача недели', ready: false },
]

export function AdminDashboard({
  user,
  token,
  onSignOut,
}: {
  user: AdminUser
  token: string
  onSignOut: () => void
}) {
  const [tab, setTab] = useState<Tab>('quizzes')

  return (
    <div className="min-h-screen bg-ink-950 text-paper-50">
      <header className="border-b border-paper-50/10 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-paper-50/50">Админка</div>
          <h1 className="text-lg font-serif">{user.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
          >
            на сайт
          </a>
          <button
            onClick={onSignOut}
            className="text-sm text-paper-50/70 hover:text-paper-50 border border-paper-50/20 rounded px-3 py-1.5"
          >
            выйти
          </button>
        </div>
      </header>

      <nav className="border-b border-paper-50/10 px-6">
        <ul className="flex gap-6">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => t.ready && setTab(t.id)}
                disabled={!t.ready}
                className={`py-3 text-sm transition border-b-2 ${
                  tab === t.id
                    ? 'border-paper-50 text-paper-50'
                    : 'border-transparent text-paper-50/50 hover:text-paper-50/80 disabled:hover:text-paper-50/30 disabled:text-paper-50/30'
                }`}
              >
                {t.label}
                {!t.ready && <span className="ml-2 text-[10px] uppercase">скоро</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {tab === 'quizzes' && <QuizzesPage token={token} />}
        {tab !== 'quizzes' && (
          <div className="rounded-xl border border-dashed border-paper-50/15 p-10 text-center text-paper-50/50">
            этот раздел ещё в разработке
          </div>
        )}
      </main>
    </div>
  )
}

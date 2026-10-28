import { lazy, Suspense, useState } from 'react'
import { AdminUser } from '../lib/api'
import { LibraryPage } from './admin/LibraryPage'
import { MaterialsPage } from './admin/MaterialsPage'
import { PollsPage } from './admin/PollsPage'
import { QuizzesPage } from './admin/QuizzesPage'
import { StudentsPage } from './admin/StudentsPage'
import { WeeklyPage } from './admin/WeeklyPage'

const StatisticsPage = lazy(() => import('./admin/StatisticsPage'))

type Tab = 'quizzes' | 'weekly' | 'library' | 'polls' | 'materials' | 'students' | 'statistics'

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: 'quizzes', label: 'Тесты', ready: true },
  { id: 'weekly', label: 'Задача недели', ready: true },
  { id: 'library', label: 'Разделы', ready: true },
  { id: 'polls', label: 'Опросы', ready: true },
  { id: 'materials', label: 'Материалы', ready: true },
  { id: 'students', label: 'Класс', ready: true },
  { id: 'statistics', label: 'Статистика', ready: true },
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

      <nav className="border-b border-paper-50/10 px-6 overflow-x-auto">
        <ul className="flex gap-6 whitespace-nowrap">
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

      <main className={`${tab === 'statistics' ? 'max-w-7xl' : 'max-w-4xl'} mx-auto px-6 py-10`}>
        {tab === 'quizzes' && <QuizzesPage token={token} />}
        {tab === 'weekly' && <WeeklyPage token={token} />}
        {tab === 'library' && <LibraryPage token={token} />}
        {tab === 'polls' && <PollsPage token={token} />}
        {tab === 'materials' && <MaterialsPage token={token} />}
        {tab === 'students' && <StudentsPage token={token} />}
        {tab === 'statistics' && <Suspense fallback={<div className="text-sm text-paper-50/50">Загрузка статистики…</div>}><StatisticsPage token={token} /></Suspense>}
      </main>
    </div>
  )
}

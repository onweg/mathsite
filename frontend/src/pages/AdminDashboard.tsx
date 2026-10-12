import { AdminUser } from '../lib/api'

export function AdminDashboard({
  user,
  onSignOut,
}: {
  user: AdminUser
  onSignOut: () => void
}) {
  return (
    <div className="min-h-screen bg-ink-950 text-paper-50">
      <header className="border-b border-paper-50/10 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-paper-50/50">Админка</div>
          <h1 className="text-lg font-serif">{user.name}</h1>
        </div>
        <button
          onClick={onSignOut}
          className="text-sm text-paper-50/70 hover:text-paper-50 border border-paper-50/20 rounded px-3 py-1.5"
        >
          Выйти
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <div className="rounded-2xl border border-paper-50/10 p-6">
          <h2 className="text-sm uppercase tracking-widest text-paper-50/50 mb-2">Скоро</h2>
          <ul className="space-y-2 text-paper-50/80">
            <li>· Материалы: загрузить PDF учебника, доп. задачник, сборник</li>
            <li>· Задача недели: написать условие + ответ, опубликовать</li>
            <li>· Нейроквизы: сгенерировать по теме, отредактировать, опубликовать</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

import { useStudent } from '../../lib/student'

/**
 * Профиль ученика. Пока минимум — имя, класс, кнопка выхода.
 * История попыток — следующий этап (А6): когда attempt будет писать student_id,
 * здесь появится список.
 */
export function StudentProfile() {
  const auth = useStudent()

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-ink-950 text-paper-50/50 flex items-center justify-center text-sm">
        загрузка…
      </div>
    )
  }

  if (auth.status === 'anon') {
    return (
      <div className="min-h-screen bg-ink-950 text-paper-50 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="font-display text-4xl text-paper-50/90">—</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50">
            Вход только по QR
          </div>
          <p className="text-paper-50/70">
            Отсканируй персональный QR от учителя, чтобы попасть в профиль.
          </p>
          <a
            href="/"
            className="inline-block text-xs text-paper-50/60 hover:text-paper-50 border border-paper-50/15 rounded-full px-4 py-2"
          >
            Назад на сайт
          </a>
        </div>
      </div>
    )
  }

  const { student } = auth

  return (
    <div className="min-h-screen bg-ink-950 text-paper-50">
      <header className="border-b border-paper-50/10 px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1">
          Назад на сайт
        </a>
        <button
          onClick={auth.signOut}
          className="text-sm text-paper-50/70 hover:text-paper-50 border border-paper-50/20 rounded px-3 py-1.5"
        >
          выйти
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
        <div className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50">
            Профиль ученика
          </div>
          <h1 className="font-display text-5xl text-paper-50">{student.name}</h1>
          <div className="text-paper-50/60">{student.class_label || 'без класса'}</div>
        </div>

        <section className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-3">
          <div className="text-sm uppercase tracking-widest text-paper-50/60">Мои квизы</div>
          <p className="text-paper-50/60 text-sm">
            Пока попыток нет. Пройди квиз на главной — результат появится здесь.
          </p>
        </section>
      </main>
    </div>
  )
}

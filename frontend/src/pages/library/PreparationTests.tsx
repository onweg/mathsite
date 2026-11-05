import { useStudent } from '../../lib/student'
import { Quizzes } from '../../sections/Quizzes'

export function PreparationTests({ track }: { track: 'oge' | 'ege' }) {
  const auth = useStudent()
  const grade = track === 'oge' ? '9' : '11'
  if (auth.status === 'loading') return <p className="text-sm text-paper-50/60">Проверяем доступ к тренировочным тестам…</p>
  if (auth.status === 'authed' && auth.student.preparation_track === track) {
    return <Quizzes key={`${track}:${auth.student.id}`} track={track} />
  }
  return (
    <div className="rounded-3xl border border-paper-50/15 bg-ink-950/50 p-6 md:p-8 space-y-4">
      <p className="text-xs uppercase tracking-widest text-gold-500">{grade} класс · {track === 'oge' ? 'ОГЭ' : 'ЕГЭ'}</p>
      <h3 className="font-display text-3xl">Тесты для прохождения</h3>
      <p className="max-w-xl text-sm text-paper-50/65">
        {auth.status === 'anon'
          ? `Дополнительные тесты доступны ученикам ${grade} класса после входа по персональному QR-коду от учителя.`
          : `Эти тесты предназначены для ${grade} класса. В твоём профиле указан класс «${auth.student.class_label || 'не задан'}». Если это ошибка, попроси учителя исправить класс.`}
      </p>
      <a href={auth.status === 'authed' && auth.student.preparation_track ? `/library/${auth.student.preparation_track}` : '/me'} className="inline-block rounded-full border border-gold-500/40 px-5 py-2 text-sm text-paper-50 hover:bg-gold-500/10">
        {auth.status === 'anon' ? 'Как войти по QR' : auth.student.preparation_track ? 'Подготовка для моего класса' : 'Мой профиль'}
      </a>
    </div>
  )
}

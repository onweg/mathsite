import { useEffect, useState } from 'react'
import {
  LibraryAction,
  LibraryCollectionDTO,
  LibraryStatsDTO,
  adminLibrary,
} from '../../lib/api'

const ACTION_LABEL: Record<LibraryAction, string> = {
  section: 'зашёл в раздел',
  open: 'открыл',
  link: 'перешёл по ссылке',
  file: 'открыл файл',
}

/**
 * Обратная связь по библиотеке: что открывают и кто это делает.
 *
 * Имя и класс есть только у тех, кто вошёл по QR. Остальные идут одной
 * строкой «без входа» — опознать их нечем, и притворяться, что можем,
 * статистика не должна.
 */
export function LibraryStats({
  token,
  collection,
  collections,
  onBack,
}: {
  token: string
  collection: string | null
  collections: LibraryCollectionDTO[]
  onBack: () => void
}) {
  const [stats, setStats] = useState<LibraryStatsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    adminLibrary
      .stats(token, collection ?? undefined)
      .then((s) => {
        if (alive) setStats(s)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'не удалось загрузить')
      })
    return () => {
      alive = false
    }
  }, [token, collection])

  const title = collection
    ? collections.find((c) => c.slug === collection)?.title ?? collection
    : 'вся библиотека'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg text-paper-50">Кто что смотрел</h2>
          <div className="mt-1 text-xs text-paper-50/40">{title}</div>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg border border-paper-50/20 px-3 py-1.5 text-sm text-paper-50/70 transition hover:text-paper-50"
        >
          ← к материалам
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400/90">
          {error}
        </div>
      )}

      {stats === null ? (
        <div className="text-sm text-paper-50/50">загрузка…</div>
      ) : stats.views === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          Пока ни одного просмотра. Счётчик начнёт заполняться, когда ученики
          зайдут в опубликованные разделы.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile value={stats.views} label="открытий всего" />
            <Tile value={stats.views_week} label="за 7 дней" />
            <Tile value={stats.students} label="учеников по QR" />
            <Tile value={stats.anonymous} label="без входа" muted />
          </div>

          <Block title="Материалы по популярности">
            {stats.items.length === 0 ? (
              <Empty text="материалов ещё нет" />
            ) : (
              <ul className="divide-y divide-paper-50/8">
                {stats.items.map((it) => (
                  <li key={it.item_id} className="flex items-center gap-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-paper-50">{it.title}</div>
                      <div className="mt-0.5 text-xs text-paper-50/40">
                        {it.is_published ? 'опубликован' : 'черновик'}
                        {it.last_view ? ` · последний раз ${ago(it.last_view)}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm text-paper-50">{it.views}</div>
                      <div className="text-[10px] uppercase tracking-wider text-paper-50/35">
                        {it.students} учен.
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Кто заходит чаще всего">
            {stats.top_students.length === 0 ? (
              <Empty text="никто не заходил по QR — имён нет" />
            ) : (
              <ul className="divide-y divide-paper-50/8">
                {stats.top_students.map((s) => (
                  <li key={s.student_id} className="flex items-center gap-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-paper-50">
                        {s.student_name}
                        {s.class_label && (
                          <span className="ml-2 text-xs text-paper-50/40">
                            {s.class_label}
                          </span>
                        )}
                      </div>
                      {s.last_view && (
                        <div className="mt-0.5 text-xs text-paper-50/40">
                          был {ago(s.last_view)}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 font-mono text-sm text-paper-50">{s.views}</div>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Последние открытия">
            <ul className="divide-y divide-paper-50/8">
              {stats.recent.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="shrink-0 text-paper-50">
                    {e.student_name || 'без входа'}
                    {e.class_label && (
                      <span className="ml-1.5 text-xs text-paper-50/40">{e.class_label}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-paper-50/60">
                    {ACTION_LABEL[e.action]}
                    {e.item_title ? ` «${e.item_title}»` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-paper-50/35">{ago(e.created_at)}</span>
                </li>
              ))}
            </ul>
          </Block>

          <p className="text-xs leading-relaxed text-paper-50/40">
            Повторный заход того же ученика в тот же материал в течение 15 минут
            не считается: иначе перезагрузка страницы накручивала бы счётчик.
            Твои собственные открытия из админки в статистику не попадают.
          </p>
        </>
      )}
    </div>
  )
}

function Tile({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-paper-50/10 bg-ink-900/40 p-4">
      <div className={`font-mono text-2xl ${muted ? 'text-paper-50/50' : 'text-paper-50'}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-paper-50/40">{label}</div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-5">
      <div className="mb-2 text-xs uppercase tracking-widest text-paper-50/50">{title}</div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-3 text-sm text-paper-50/40">{text}</div>
}

/** «12 минут назад» — для ленты это читается быстрее точного времени. */
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU')
}

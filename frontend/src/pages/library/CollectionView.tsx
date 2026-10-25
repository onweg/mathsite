import { useEffect, useMemo, useState } from 'react'
import { Reveal, RevealText } from '../../components/RevealText'
import {
  LibraryCollectionDTO,
  LibraryItemPublicDTO,
  LibraryKind,
  publicLibrary,
} from '../../lib/api'
import { BackLink } from './BackLink'
import { ItemCard } from './ItemCard'
import { COLLECTION_FALLBACK, KIND_LABEL, accentOf, plural } from './meta'

type Filter = 'all' | LibraryKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'article', label: 'Статьи' },
  { id: 'link', label: 'Ссылки' },
  { id: 'file', label: 'Файлы' },
]

/** Одна полка: список материалов с фильтром по виду. */
export function CollectionView({
  slug,
  collections,
}: {
  slug: string
  collections: LibraryCollectionDTO[] | null
}) {
  const [items, setItems] = useState<LibraryItemPublicDTO[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const meta = collections?.find((c) => c.slug === slug)
  const accent = accentOf(slug)
  // Названия полок зашиты и на фронте: заголовок виден сразу, а не после
  // ответа сервера — и остаётся на месте, если ответа вовсе не будет.
  const title = meta?.title ?? COLLECTION_FALLBACK[slug as keyof typeof COLLECTION_FALLBACK]

  useEffect(() => {
    let alive = true
    publicLibrary
      .items(slug)
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch(() => {
        if (!alive) return
        setItems([])
        setFailed(true)
      })
    // Отметка «зашёл в раздел»: по ней учитель видит, какие полки живые.
    publicLibrary.track({ collection: slug, action: 'section' })
    return () => {
      alive = false
    }
  }, [slug])

  const shown = useMemo(
    () => (filter === 'all' ? items ?? [] : (items ?? []).filter((i) => i.kind === filter)),
    [items, filter],
  )

  const available = useMemo(() => {
    const kinds = new Set((items ?? []).map((i) => i.kind))
    return FILTERS.filter((f) => f.id === 'all' || kinds.has(f.id))
  }, [items])

  return (
    <>
      <header className="pb-14 md:pb-16">
        <div className="mb-8">
          <BackLink href="/library">Все полки</BackLink>
        </div>

        <h2 className="max-w-5xl font-display text-[clamp(2.3rem,5.2vw,5.6rem)] font-light leading-[1.02] tracking-tight">
          <RevealText as="span" className="block">
            {title ?? 'Раздел не найден'}
          </RevealText>
        </h2>

        {meta?.subtitle && (
          <Reveal delay={0.2} className="mt-8">
            <p className="max-w-2xl text-pretty font-serif text-lg italic leading-snug text-paper-100/80 md:text-xl">
              {meta.subtitle}
            </p>
          </Reveal>
        )}

        {items !== null && items.length > 0 && (
          <div className="mt-12 flex flex-wrap items-center gap-2">
            {available.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                data-cursor
                className={`rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${
                  filter === f.id
                    ? `${accent.border} bg-paper-50/5 text-paper-50`
                    : 'border-paper-50/10 text-paper-50/50 hover:border-paper-50/30 hover:text-paper-50/80'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper-50/35">
              {plural(shown.length, 'материал', 'материала', 'материалов')}
            </span>
          </div>
        )}
      </header>

      <div>
        {items === null ? (
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
            загружаем…
          </div>
        ) : items.length === 0 ? (
          <Empty failed={failed} />
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-paper-50/12 p-10 text-center text-sm text-paper-50/50">
            В этом разделе пока нет материалов вида «{KIND_LABEL[filter as LibraryKind]}».
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((item, i) => (
              <ItemCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Empty({ failed }: { failed: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-paper-50/12 p-12 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
        {failed ? 'не удалось загрузить раздел' : 'полка пока пустая'}
      </div>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-paper-50/60">
        {failed
          ? 'Обнови страницу через минуту. Если не поможет — скажи учителю.'
          : 'Учитель собирает сюда статьи, разборы и ссылки. Как только появится первый материал — он будет здесь.'}
      </p>
    </div>
  )
}

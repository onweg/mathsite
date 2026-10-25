import { useEffect, useState } from 'react'
import { Prose } from '../../components/Prose'
import { Reveal, RevealText } from '../../components/RevealText'
import {
  LibraryCollectionDTO,
  LibraryItemDetailDTO,
  fileUrl,
  publicLibrary,
} from '../../lib/api'
import { BackLink } from './BackLink'
import {
  COLLECTION_FALLBACK,
  KIND_LABEL,
  accentOf,
  fileSize,
  hostOf,
} from './meta'

/** Страница одного материала: своя статья или заметка учителя к ссылке/файлу. */
export function ArticleView({
  collection,
  slug,
  collections,
}: {
  collection: string
  slug: string
  collections: LibraryCollectionDTO[] | null
}) {
  const [item, setItem] = useState<LibraryItemDetailDTO | null>(null)
  const [missing, setMissing] = useState(false)

  const meta = collections?.find((c) => c.slug === collection)
  const accent = accentOf(collection)
  const collectionTitle =
    meta?.title ?? COLLECTION_FALLBACK[collection as keyof typeof COLLECTION_FALLBACK]

  useEffect(() => {
    let alive = true
    publicLibrary
      .item(collection, slug)
      .then((data) => {
        if (!alive) return
        setItem(data)
        publicLibrary.track({ collection, action: 'open', item_id: data.id })
      })
      .catch(() => {
        if (alive) setMissing(true)
      })
    return () => {
      alive = false
    }
  }, [collection, slug])

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
          материал не найден
        </div>
        <p className="mt-5 text-sm text-paper-50/60">
          Возможно, учитель снял его с публикации или поменял название.
        </p>
        <div className="mt-8 flex justify-center">
          <BackLink href={`/library/${collection}`}>Вернуться в раздел</BackLink>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
        загружаем…
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-10">
        <BackLink href={`/library/${collection}`}>
          {collectionTitle ?? 'Назад в раздел'}
        </BackLink>
      </div>

      <div className={`mb-6 font-mono text-[10px] uppercase tracking-[0.28em] ${accent.text}`}>
        {KIND_LABEL[item.kind]}
      </div>

      <h2 className="text-balance font-display text-[clamp(2rem,4.6vw,3.6rem)] font-light leading-[1.05] tracking-tight">
        <RevealText as="span" className="block">
          {item.title}
        </RevealText>
      </h2>

      {item.summary && (
        <Reveal delay={0.15} className="mt-8">
          <p className="text-pretty font-serif text-xl italic leading-snug text-paper-100/80">
            {item.summary}
          </p>
        </Reveal>
      )}

      {(item.kind === 'link' || item.kind === 'file') && (
        <Reveal delay={0.2} className="mt-10">
          <ItemAction item={item} />
        </Reveal>
      )}

      {item.body_md.trim() && (
        <Reveal delay={0.25} className="mt-14">
          <Prose text={item.body_md} />
        </Reveal>
      )}

      <div className="mt-20 border-t border-paper-50/8 pt-8">
        <a
          href={`/library/${collection}`}
          data-cursor
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/60 transition-colors hover:text-paper-50"
        >
          ← весь раздел «{collectionTitle ?? 'библиотека'}»
        </a>
      </div>
    </article>
  )
}

/** Кнопка «перейти» / «открыть файл» — то, ради чего материал и добавляли. */
function ItemAction({ item }: { item: LibraryItemDetailDTO }) {
  const accent = accentOf(item.collection)
  const isLink = item.kind === 'link'
  const href = isLink ? item.url : item.file_url ? fileUrl(item.file_url) : ''
  if (!href) return null

  const note = isLink
    ? hostOf(item.url)
    : [item.file_name, fileSize(item.file_size)].filter(Boolean).join(' · ')

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="lg"
      data-cursor-label={isLink ? 'Перейти' : 'Открыть'}
      onClick={() => {
        // Файл считает сам сервер при отдаче, внешнюю ссылку — только мы.
        if (isLink) {
          publicLibrary.track({
            collection: item.collection,
            action: 'link',
            item_id: item.id,
          })
        }
      }}
      className={`group inline-flex max-w-full items-center gap-4 rounded-2xl border ${accent.border} bg-paper-50/[0.03] px-6 py-4 transition-colors hover:bg-paper-50/[0.07]`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.bg}`} />
      <span className="min-w-0">
        <span className="block font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50">
          {isLink ? 'Перейти по ссылке' : 'Открыть файл'}
        </span>
        {note && (
          <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.18em] text-paper-50/45">
            {note}
          </span>
        )}
      </span>
    </a>
  )
}

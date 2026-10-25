import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { RevealText } from '../components/RevealText'
import { scrollToElement } from '../hooks/useLenis'
import { LibraryCollectionDTO, publicLibrary } from '../lib/api'
import { isLibraryPath, useRoute } from '../lib/router'
import { ArticleView } from '../pages/library/ArticleView'
import { CollectionView } from '../pages/library/CollectionView'
import { accentOf, plural } from '../pages/library/meta'

/**
 * Библиотека — секция главной, а не отдельная страница: к ней так же
 * спускаются прокруткой, как к задаче недели или тестам.
 *
 * Адреса у полок при этом свои — секция смотрит на них сама:
 *     /                             — полки свёрнуты, видна витрина
 *     /library/<полка>              — материалы полки
 *     /library/<полка>/<материал>   — сам материал
 * Так ссылку на нужную полку можно дать ученику, а «назад» в браузере
 * возвращает из материала в полку, а не уводит с сайта.
 *
 * Внутренние экраны лежат в `pages/library/` — там же, где были, когда
 * библиотека была страницей.
 */
export function Library() {
  const path = useRoute()
  const parts = isLibraryPath(path) ? path.split('/').filter(Boolean) : []
  const collection = parts[1] ?? null
  const itemSlug = parts[2] ? decodeURIComponent(parts[2]) : null

  const [collections, setCollections] = useState<LibraryCollectionDTO[] | null>(null)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    publicLibrary
      .collections()
      .then(setCollections)
      .catch(() => setCollections([]))
  }, [])

  // Пришли по прямой ссылке на полку — страница должна открыться на ней,
  // а не на первом экране. Один раз при монтировании: дальше прокруткой
  // заведует роутер, и вмешиваться в неё отсюда нельзя.
  useEffect(() => {
    if (!isLibraryPath(window.location.pathname)) return
    scrollToElement(ref.current, { immediate: true })
  }, [])

  return (
    <section
      id="library"
      ref={ref}
      className="relative scroll-mt-24 border-y border-paper-50/5 bg-ink-900 py-32 md:py-44"
    >
      <div className="mx-auto max-w-[1700px] px-6 md:px-10">
        {!collection ? (
          <Shelves collections={collections} />
        ) : itemSlug ? (
          <ArticleView collection={collection} slug={itemSlug} collections={collections} />
        ) : (
          <CollectionView slug={collection} collections={collections} />
        )}
      </div>
    </section>
  )
}

/** Витрина: четыре полки. Это то, что видно, пока никуда не заходили. */
function Shelves({ collections }: { collections: LibraryCollectionDTO[] | null }) {
  return (
    <>
      <header className="mb-14 md:mb-20">
        <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
          <span className="h-px w-10 bg-paper-50/40" />
          <span>
            Библиотека
            {collections?.length
              ? ` · ${plural(collections.length, 'полка', 'полки', 'полок')}`
              : ''}
          </span>
        </div>
        <h2 className="font-display text-[clamp(2.3rem,5.2vw,5.6rem)] font-light leading-[1] tracking-tight">
          <RevealText as="span" className="block">
            Всё, что стоит
          </RevealText>
          <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
            прочитать и решить
          </RevealText>
        </h2>
        <p className="mt-8 max-w-xl text-pretty text-base leading-relaxed text-paper-100/75">
          Статьи, разборы, сборники и ссылки — разложены по полкам. Заходи в
          нужную, бери что надо: читать можно прямо здесь, файлы открываются и
          скачиваются.
        </p>
      </header>

      {collections === null ? (
        <div className="font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
          загружаем…
        </div>
      ) : collections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-paper-50/12 p-12 text-center text-sm text-paper-50/55">
          Полки пока не отвечают. Обнови страницу через минуту.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {collections.map((c, i) => (
            <ShelfCard key={c.slug} collection={c} index={i} />
          ))}
        </div>
      )}
    </>
  )
}

function ShelfCard({
  collection,
  index,
}: {
  collection: LibraryCollectionDTO
  index: number
}) {
  const accent = accentOf(collection.slug)
  const empty = collection.count === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: index * 0.08 }}
    >
      <a
        href={`/library/${collection.slug}`}
        data-cursor="lg"
        data-cursor-label="Открыть"
        className="glow-cursor group relative flex h-full min-h-[20rem] flex-col justify-between overflow-hidden rounded-3xl border border-paper-50/8 bg-ink-950/60 p-8 transition-colors duration-500 hover:border-paper-50/20 md:min-h-[24rem] md:p-11"
      >
        <div className="flex items-start justify-between gap-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/45">
            {empty
              ? 'пока пусто'
              : plural(collection.count, 'материал', 'материала', 'материалов')}
          </span>
          <span
            className={`select-none font-display text-5xl italic leading-none ${accent.num}`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        <div>
          <h3 className="text-balance font-display text-3xl font-light leading-tight tracking-tight text-paper-50 md:text-[2.6rem]">
            {collection.title}
          </h3>
          <p className="mt-5 max-w-[42ch] text-pretty text-sm leading-relaxed text-paper-100/65">
            {collection.subtitle}
          </p>

          <div className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/80">
            <span className="relative overflow-hidden">
              <span className="block transition-transform duration-500 ease-out-expo group-hover:-translate-y-full">
                Открыть полку
              </span>
              <span
                className={`absolute inset-0 block translate-y-full transition-transform duration-500 ease-out-expo group-hover:translate-y-0 ${accent.text}`}
              >
                Открыть полку
              </span>
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${accent.bg}`} />
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              'linear-gradient(to right, #f6f2ea 1px, transparent 1px), linear-gradient(to bottom, #f6f2ea 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </a>
    </motion.div>
  )
}

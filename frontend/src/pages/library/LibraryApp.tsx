import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Cursor } from '../../components/Cursor'
import { Nav } from '../../components/Nav'
import { Reveal, RevealText } from '../../components/RevealText'
import { Footer } from '../../sections/Footer'
import { useLenis } from '../../hooks/useLenis'
import { LibraryCollectionDTO, publicLibrary } from '../../lib/api'
import { useRoute } from '../../lib/router'
import { VoiceProvider } from '../../lib/voice'
import { ArticleView } from './ArticleView'
import { BackLink } from './BackLink'
import { CollectionView } from './CollectionView'
import { accentOf, plural } from './meta'

/**
 * Библиотека: полки с материалами, которые учитель собирает сам.
 *
 * Роутинг тут такой же ручной, как во всём приложении (react-router в проект
 * не тащили):
 *     /library                      — все полки
 *     /library/<полка>              — материалы полки
 *     /library/<полка>/<материал>   — страница материала
 */
export function LibraryApp() {
  useLenis()

  const path = useRoute()
  const parts = path.split('/').filter(Boolean)
  const collection = parts[1] ?? null
  const itemSlug = parts[2] ? decodeURIComponent(parts[2]) : null

  const [collections, setCollections] = useState<LibraryCollectionDTO[] | null>(null)

  useEffect(() => {
    publicLibrary
      .collections()
      .then(setCollections)
      .catch(() => setCollections([]))
  }, [])

  return (
    <VoiceProvider>
      <div className="noise vignette relative min-h-screen">
        <Cursor />
        <Nav />
        <main>
          {!collection ? (
            <Hub collections={collections} />
          ) : itemSlug ? (
            <ArticleView
              collection={collection}
              slug={itemSlug}
              collections={collections}
            />
          ) : (
            <CollectionView slug={collection} collections={collections} />
          )}
        </main>
        <Footer />
      </div>
    </VoiceProvider>
  )
}

function Hub({ collections }: { collections: LibraryCollectionDTO[] | null }) {
  return (
    <>
      <header className="mx-auto max-w-[1700px] px-6 pb-20 pt-36 md:px-10 md:pt-44">
        <div className="mb-8">
          <BackLink href="/">На главную</BackLink>
        </div>

        <div className="mb-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
          <span className="h-px w-10 bg-paper-50/40" />
          <span>
            Библиотека
            {collections?.length
              ? ` · ${plural(collections.length, 'полка', 'полки', 'полок')}`
              : ''}
          </span>
        </div>

        <h1 className="max-w-5xl font-display text-[clamp(2.6rem,6.4vw,6.8rem)] font-light leading-[1] tracking-tight">
          <RevealText as="span" className="block">
            Всё, что стоит
          </RevealText>
          <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
            прочитать и решить
          </RevealText>
        </h1>

        <Reveal delay={0.3} className="mt-10">
          <p className="max-w-xl text-pretty text-base leading-relaxed text-paper-100/80">
            Статьи, разборы, сборники и ссылки — разложены по полкам. Заходи в
            нужную, бери что надо: читать можно прямо здесь, файлы открываются и
            скачиваются.
          </p>
        </Reveal>
      </header>

      <section className="mx-auto max-w-[1700px] px-6 pb-32 md:px-10 md:pb-44">
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
      </section>
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
        className="glow-cursor group relative flex h-full min-h-[20rem] flex-col justify-between overflow-hidden rounded-3xl border border-paper-50/8 bg-ink-900/70 p-8 transition-colors duration-500 hover:border-paper-50/20 md:min-h-[24rem] md:p-11"
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
          <h2 className="text-balance font-display text-3xl font-light leading-tight tracking-tight text-paper-50 md:text-[2.6rem]">
            {collection.title}
          </h2>
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

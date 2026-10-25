import { motion } from 'framer-motion'
import { LibraryItemPublicDTO, fileUrl, publicLibrary } from '../../lib/api'
import { KIND_LABEL, accentOf, fileSize, hostOf } from './meta'

/**
 * Карточка материала на полке.
 *
 * Куда ведёт клик, зависит от того, написал ли учитель к материалу свой
 * текст. Написал — открываем страницу материала (там и текст, и кнопка
 * перехода), не написал — ведём сразу на ссылку или в файл: лишний экран
 * с одной кнопкой никому не нужен.
 */
export function ItemCard({
  item,
  index,
}: {
  item: LibraryItemPublicDTO
  index: number
}) {
  const accent = accentOf(item.collection)
  const ownPage = item.kind === 'article' || item.has_body
  const href = ownPage
    ? `/library/${item.collection}/${item.slug}`
    : item.kind === 'link'
      ? item.url
      : item.file_url
        ? fileUrl(item.file_url)
        : '#'

  const external = !ownPage
  const meta =
    item.kind === 'link'
      ? hostOf(item.url)
      : item.kind === 'file'
        ? [item.file_name, fileSize(item.file_size)].filter(Boolean).join(' · ')
        : ''

  const action =
    item.kind === 'article' ? 'Читать' : item.kind === 'link' ? 'Перейти' : 'Открыть файл'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 6) * 0.06 }}
    >
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        data-cursor="lg"
        data-cursor-label={action}
        onClick={() => {
          // Уход по внешней ссылке сервер сам не увидит — отмечаем отсюда.
          // Файл считает эндпоинт отдачи, страницу — сама страница.
          if (external && item.kind === 'link') {
            publicLibrary.track({
              collection: item.collection,
              action: 'link',
              item_id: item.id,
            })
          }
        }}
        className="glow-cursor group relative flex h-full flex-col overflow-hidden rounded-2xl border border-paper-50/8 bg-ink-900/70 p-7 transition-colors duration-500 hover:border-paper-50/20 md:p-8"
      >
        <div className="flex items-center justify-between gap-4">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.28em] ${accent.text}`}
          >
            {KIND_LABEL[item.kind]}
          </span>
          {meta && (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-paper-50/40">
              {meta}
            </span>
          )}
        </div>

        <h3 className="mt-6 text-balance font-display text-2xl font-light leading-tight tracking-tight text-paper-50 md:text-[1.7rem]">
          {item.title}
        </h3>

        {item.summary && (
          <p className="mt-4 max-w-[46ch] text-pretty text-sm leading-relaxed text-paper-100/65">
            {item.summary}
          </p>
        )}

        <div className="mt-7 flex items-center gap-3 pt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/80">
          <span className="relative overflow-hidden">
            <span className="block transition-transform duration-500 ease-out-expo group-hover:-translate-y-full">
              {action}
            </span>
            <span
              className={`absolute inset-0 block translate-y-full transition-transform duration-500 ease-out-expo group-hover:translate-y-0 ${accent.text}`}
            >
              {action}
            </span>
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${accent.bg}`} />
        </div>
      </a>
    </motion.div>
  )
}

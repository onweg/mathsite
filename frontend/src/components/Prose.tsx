import { Markdown } from './Markdown'

/**
 * Статья учителя: заголовки, списки, цитаты, разделители — и формулы внутри.
 *
 * Блочную структуру разбираем здесь, а всё, что внутри строки (формулы $…$ и
 * ссылки), отдаём `Markdown`: один разборщик инлайна на весь сайт.
 * Полноценный markdown сюда не тащим — учителю нужны абзацы, подзаголовки и
 * списки, а не таблицы с html.
 */
export function Prose({ text }: { text: string }) {
  const blocks = parse(text)
  return (
    <div className="space-y-6">
      {blocks.map((b, i) => {
        if (b.type === 'h2') {
          return (
            <h2
              key={i}
              className="pt-4 font-display text-2xl font-light leading-tight text-paper-50 md:text-3xl"
            >
              {b.lines[0]}
            </h2>
          )
        }
        if (b.type === 'h3') {
          return (
            <h3
              key={i}
              className="pt-2 font-serif text-xl italic leading-tight text-gold-500 md:text-2xl"
            >
              {b.lines[0]}
            </h3>
          )
        }
        if (b.type === 'divider') {
          return <hr key={i} className="border-paper-50/10" />
        }
        if (b.type === 'quote') {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-gold-500/50 pl-5 font-serif text-lg italic leading-relaxed text-paper-100/85"
            >
              <Markdown text={b.lines.join('\n')} />
            </blockquote>
          )
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type === 'ul' ? 'ul' : 'ol'
          return (
            <List
              key={i}
              className={`space-y-2 pl-6 text-paper-100/85 ${
                b.type === 'ul' ? 'list-disc' : 'list-decimal'
              } marker:text-gold-500/70`}
            >
              {b.lines.map((line, j) => (
                <li key={j} className="pl-1 leading-relaxed">
                  <Markdown text={line} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <div key={i} className="text-[17px] leading-relaxed text-paper-100/85">
            <Markdown text={b.lines.join('\n')} />
          </div>
        )
      })}
    </div>
  )
}

type Block = {
  type: 'p' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'divider'
  lines: string[]
}

const UL_RE = /^[-*•]\s+/
const OL_RE = /^\d+[.)]\s+/

function parse(text: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null

  const flush = () => {
    if (current) blocks.push(current)
    current = null
  }
  const push = (type: Block['type'], line: string) => {
    // Соседние строки одного вида собираются в один блок: так список
    // остаётся списком, а абзац не рвётся на строки.
    if (current && current.type === type && type !== 'h2' && type !== 'h3') {
      current.lines.push(line)
    } else {
      flush()
      current = { type, lines: [line] }
    }
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    if (/^---+$/.test(line.trim())) {
      flush()
      blocks.push({ type: 'divider', lines: [] })
      continue
    }
    if (line.startsWith('### ')) {
      push('h3', line.slice(4).trim())
    } else if (line.startsWith('## ')) {
      push('h2', line.slice(3).trim())
    } else if (line.startsWith('# ')) {
      push('h2', line.slice(2).trim())
    } else if (line.startsWith('> ')) {
      push('quote', line.slice(2))
    } else if (UL_RE.test(line)) {
      push('ul', line.replace(UL_RE, ''))
    } else if (OL_RE.test(line)) {
      push('ol', line.replace(OL_RE, ''))
    } else {
      push('p', line)
    }
  }
  flush()
  return blocks
}

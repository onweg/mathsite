import 'katex/dist/katex.min.css'
import { BlockMath, InlineMath } from 'react-katex'

/**
 * Простой парсер под нашу задачу: ищет $$...$$ (блочные формулы)
 * и $...$ (инлайн), остальное рендерит как текст с переносами.
 * Больше ничего из markdown нам не нужно.
 */
export function Markdown({ text }: { text: string }) {
  const tokens = tokenize(text)
  return (
    <div className="space-y-2 whitespace-pre-wrap text-[15px] leading-relaxed">
      {tokens.map((t, i) => {
        if (t.type === 'block') {
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <BlockMath math={t.value} />
            </div>
          )
        }
        if (t.type === 'inline') {
          return <InlineMath key={i} math={t.value} />
        }
        return <span key={i}>{t.value}</span>
      })}
    </div>
  )
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'inline'; value: string }
  | { type: 'block'; value: string }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  // Сначала выделим блочные $$...$$, потом внутри оставшегося — инлайн $...$
  const blockRe = /\$\$([\s\S]+?)\$\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push(...tokenizeInline(text.slice(last, m.index)))
    }
    tokens.push({ type: 'block', value: m[1].trim() })
    last = blockRe.lastIndex
  }
  if (last < text.length) {
    tokens.push(...tokenizeInline(text.slice(last)))
  }
  return tokens
}

function tokenizeInline(text: string): Token[] {
  const tokens: Token[] = []
  // Пропускаем одиночный '$' если он один (например «$100»)
  const inlineRe = /\$([^\$\n]+?)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = inlineRe.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, m.index) })
    }
    tokens.push({ type: 'inline', value: m[1].trim() })
    last = inlineRe.lastIndex
  }
  if (last < text.length) {
    tokens.push({ type: 'text', value: text.slice(last) })
  }
  return tokens
}

import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

/**
 * Простой парсер под нашу задачу: ищет $$...$$ (блочные формулы)
 * и $...$ (инлайн), остальное рендерит как текст с переносами.
 * Больше ничего из markdown нам не нужно.
 */
export function Markdown({ text }: { text: string }) {
  const tokens = tokenize(text)
  return (
    <div className="math-rich space-y-2 whitespace-pre-wrap text-[15px]">
      {tokens.map((t, i) => {
        if (t.type === 'block') {
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <Formula tex={t.value} display />
            </div>
          )
        }
        if (t.type === 'inline') {
          return <Formula key={i} tex={t.value} />
        }
        return <span key={i}>{t.value}</span>
      })}
    </div>
  )
}

/** Разметку отдаёт KaTeX: вход он экранирует сам, \href и \url выключены (trust по умолчанию false). */
function Formula({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        output: mathOutput(),
        throwOnError: false,
      }),
    [tex, display],
  )
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Чем рисовать формулу — своей вёрсткой KaTeX или нативным MathML.
 *
 * В браузере можно задать минимальный размер шрифта (Chrome: настройки →
 * внешний вид → настроить шрифты; Safari: «никогда не использовать шрифт
 * меньше»). Тогда мелкие куски формулы насильно укрупняются, а смещения
 * внутри дроби KaTeX уже посчитал в em по исходному кеглю — и показатель
 * степени из знаменателя уезжает через дробную черту в числитель и на строку
 * выше. MathML от этого не страдает: там раскладывает сам браузер.
 *
 * Самая мелкая часть формулы у KaTeX — половина базового кегля, то есть около
 * 9px при нашем тексте в 15px. Если браузер не даёт опускаться ниже, уходим
 * на MathML; в обычном случае оставляем привычную вёрстку KaTeX.
 */
let cachedOutput: 'htmlAndMathml' | 'mathml' | null = null

function mathOutput(): 'htmlAndMathml' | 'mathml' {
  if (cachedOutput) return cachedOutput
  cachedOutput = minimumFontSize() > 9 && 'MathMLElement' in window ? 'mathml' : 'htmlAndMathml'
  return cachedOutput
}

function minimumFontSize(): number {
  try {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:1px'
    probe.textContent = 'x'
    document.body.appendChild(probe)
    const size = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    return Number.isFinite(size) ? size : 1
  } catch {
    return 1
  }
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

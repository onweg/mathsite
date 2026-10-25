import { LibraryCollection, LibraryKind } from '../../lib/api'

type Accent = {
  /** цвет акцента полки: чередуем золото и шалфей, как в карточках главной */
  text: string
  bg: string
  border: string
  num: string
}

const GOLD: Accent = {
  text: 'text-gold-500',
  bg: 'bg-gold-500',
  border: 'border-gold-500/40',
  num: 'text-gold-500/80',
}

const SAGE: Accent = {
  text: 'text-sage-500',
  bg: 'bg-sage-500',
  border: 'border-sage-500/40',
  num: 'text-sage-500/80',
}

/** Полки заводит бэкенд; тут только то, как они выглядят. */
const ACCENTS: Record<string, Accent> = {
  around: GOLD,
  olympiad: SAGE,
  oge: GOLD,
  ege: SAGE,
}

export function accentOf(slug: string): Accent {
  return ACCENTS[slug] ?? GOLD
}

export const KIND_LABEL: Record<LibraryKind, string> = {
  article: 'Статья',
  link: 'Ссылка',
  file: 'Файл',
}

export const COLLECTION_FALLBACK: Record<LibraryCollection, string> = {
  around: 'Математика вокруг нас',
  olympiad: 'Подготовка к олимпиадам',
  oge: 'Подготовка к ОГЭ',
  ege: 'Подготовка к ЕГЭ',
}

/** «12 материалов» с правильным окончанием. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}

export function fileSize(bytes: number): string {
  if (bytes <= 0) return ''
  const mb = bytes / 1024 / 1024
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`
}

/** Домен ссылки — показываем рядом с названием, чтобы было видно, куда уходишь. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

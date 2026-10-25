/**
 * Кнопка «назад» в библиотеке.
 *
 * Раньше наверху стояли хлебные крошки мелким моноширинным — как ссылка они
 * не читались, и выйти из раздела можно было только кнопкой браузера.
 * Поэтому не путь целиком, а одна заметная кнопка с ясной подписью: откуда
 * пришёл, туда и вернёшься.
 */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      data-cursor
      data-cursor-label="Назад"
      className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-paper-50/12 bg-paper-50/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper-50/70 transition-colors hover:border-paper-50/30 hover:text-paper-50"
    >
      <span
        aria-hidden
        className="inline-block transition-transform duration-500 ease-out-expo group-hover:-translate-x-1"
      >
        ←
      </span>
      <span className="truncate">{children}</span>
    </a>
  )
}

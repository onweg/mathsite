export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-paper-50/8 bg-ink-900 pb-10 pt-20">
      <div className="mx-auto max-w-[1700px] px-6 md:px-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-2">
            <div className="font-display text-5xl font-light leading-none tracking-tight md:text-7xl">
              Mathematica<span className="italic text-gold-500">.</span>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-paper-100/70">
              Сайт учителя математики. Прототип для показа коллегам.
              Разработан вместе с ИИ. 2026.
            </p>
          </div>

          <div>
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
              Разделы
            </div>
            <ul className="space-y-2 font-serif text-base italic text-paper-100/90">
              {['ИИ-теоретик', 'Пропустил урок', 'Задача недели', 'Вклад в оценку'].map((t) => (
                <li key={t}>
                  <a href="#" data-cursor className="transition-colors hover:text-gold-500">
                    {t}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
              Контакты
            </div>
            <ul className="space-y-2 font-serif text-base italic text-paper-100/90">
              <li>abdulewix@mail.com</li>
              <li>школа · 8 класс</li>
              <li>показ коллегам · ноябрь</li>
            </ul>
          </div>
        </div>

        <div className="mt-20 flex flex-col items-start justify-between gap-6 border-t border-paper-50/8 pt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50 md:flex-row md:items-center">
          <span>© 2026 · Mathematica · All rights reserved</span>
          <span>Powered by YandexGPT · pgvector · FastAPI</span>
          <span>v 0.0.1 · prototype</span>
        </div>
      </div>
    </footer>
  )
}

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { StudentDTO, adminStudents } from '../../lib/api'

/**
 * Печать QR-кодов класса. Открывается в новой вкладке.
 * Стили @media print заточены под A4: сетка 2×4 (8 карточек на лист).
 * Отрезать по пунктирной линии.
 */
export function PrintClassPage({ token }: { token: string }) {
  const [students, setStudents] = useState<StudentDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const params = new URLSearchParams(window.location.search)
  const classLabel = params.get('class') ?? ''

  useEffect(() => {
    adminStudents
      .list(token, classLabel || undefined)
      .then(setStudents)
      .catch((e) => setError(e instanceof Error ? e.message : 'ошибка'))
  }, [classLabel])

  if (error) return <div className="p-10 text-red-500">{error}</div>
  if (!students) return <div className="p-10 text-paper-50/50">загрузка…</div>
  if (students.length === 0) return <div className="p-10">в классе «{classLabel}» нет учеников</div>

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="min-h-screen bg-white text-black">
        <header className="no-print flex items-center justify-between border-b border-black/10 px-6 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-black/60">
              Класс «{classLabel || 'без класса'}» · {students.length} учеников
            </div>
            <div className="text-sm text-black/70 mt-1">
              Проверь всё и нажми «Печать» — браузер покажет диалог. Отрезай по пунктирной линии.
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-black text-white px-4 py-2 text-sm font-medium"
          >
            Печать
          </button>
        </header>

        <main className="p-6">
          <div className="grid grid-cols-2 gap-6">
            {students.map((s) => (
              <QrCard key={s.id} student={s} />
            ))}
          </div>
        </main>
      </div>
    </>
  )
}

function QrCard({ student }: { student: StudentDTO }) {
  const url = `${window.location.origin}/s/${student.qr_token}`
  return (
    <div
      className="border border-dashed border-black/60 p-5 flex gap-5 items-center"
      style={{ pageBreakInside: 'avoid' }}
    >
      <div className="shrink-0 bg-white p-2 border border-black/20">
        <QRCodeSVG value={url} size={128} level="M" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-black/60">
          matematika-urok.ru
        </div>
        <div className="text-lg font-serif mt-1">{student.name}</div>
        <div className="text-xs text-black/60 mt-0.5">{student.class_label}</div>
        <div className="text-[10px] font-mono text-black/40 mt-2 break-all">
          {url}
        </div>
      </div>
    </div>
  )
}

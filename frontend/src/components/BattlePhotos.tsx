import { useEffect, useState } from 'react'
import { apiJson, BASE } from '../lib/api'
import { uploadBattlePhoto } from '../lib/battles'

function Photo({ rid, id, token, label }: { rid: string; id: string; token?: string; label: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    setUrl(''); setError(false)
    void (async () => {
      try {
        const r = await fetch(`${BASE}/${token ? 'admin/' : ''}battles/${rid}/photos/${id}`, {
          credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal,
        })
        if (!r.ok) throw new Error('Фото недоступно')
        const blob = await r.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch { if (!controller.signal.aborted) setError(true) }
    })()
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [rid, id, token])
  if (error) return <p role="alert" className="text-sm text-red-300">Не удалось загрузить фото. Обновите страницу.</p>
  if (!url) return <p className="text-sm">Загрузка фото…</p>
  return <a href={url} target="_blank" rel="noreferrer" className="block" title="Открыть фото в полном размере"><img src={url} alt={label} className="max-h-96 max-w-full rounded-lg object-contain" /></a>
}

export function BattlePhotos({ rid, token, ids = [], label }: { rid: string; token?: string; ids?: string[]; label: string }) {
  return <div className="space-y-3">{ids.map((id, i) => <Photo key={id} rid={rid} id={id} token={token} label={`${label} ${i + 1}`} />)}</div>
}

export function BattlePhotoPicker({ rid, taskId, purpose, label, ids, disabled, onChange, onBusy }: {
  rid: string; taskId?: string; purpose: 'question' | 'reference' | 'answer'; label: string;
  ids: string[]; disabled: boolean; onChange: (ids: string[]) => void; onBusy: (value: boolean) => void;
}) {
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  return <div className="space-y-3 rounded-lg border border-paper-50/15 p-3">
    <label className="block text-sm">{label}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || ids.length >= 3}
      className="mt-2 block w-full text-sm" onChange={async e => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (!files.length || disabled) return
        setError('')
        if (files.length + ids.length > 3) { setError('Можно прикрепить не больше 3 фотографий к одному полю'); return }
        onBusy(true); setUploading(true)
        const next = [...ids]
        try {
          for (const file of files) {
            next.push(await uploadBattlePhoto(rid, purpose, file, taskId))
            onChange([...next])
          }
        } catch (e) { setError((e as Error).message) }
        finally { onBusy(false); setUploading(false) }
      }} /></label>
    <p className="text-xs text-paper-50/60">До 3 фото, каждое до 8 МБ. JPG, PNG или WebP. Нажмите на фото, чтобы увеличить.</p>
    {uploading && <p role="status" className="text-sm">Загружаем фото…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {ids.map((id, i) => <div key={id} className="space-y-2"><Photo rid={rid} id={id} label={`${label} ${i + 1}`} /><button type="button" disabled={disabled} className="text-sm text-red-300 underline" onClick={() => {
      onChange(ids.filter(value => value !== id))
      // Saved images remain until the edited task is saved; snapshots stay immutable.
      void apiJson(`/battles/${rid}/photos/${id}`, { method: 'DELETE' }).catch(() => {})
    }}>Убрать фото {i + 1}</button></div>)}
  </div>
}

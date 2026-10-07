const BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; text: string }
export type Topic = 'algebra' | 'geometry'

export type ChatReply = {
  text: string
  blocked: boolean
  reason: string | null
}

export async function chat(
  messages: ChatMessage[],
  opts: { topic?: Topic; section?: string } = {},
): Promise<ChatReply> {
  const r = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, topic: opts.topic, section: opts.section }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`chat ${r.status}: ${text || r.statusText}`)
  }
  const data = (await r.json()) as {
    text: string
    blocked?: boolean
    reason?: string | null
  }
  return {
    text: data.text,
    blocked: Boolean(data.blocked),
    reason: data.reason ?? null,
  }
}

export type RagChunk = {
  page: number | null
  source: string
  similarity: number
  preview: string
}

export type RagReply = {
  text: string
  blocked: boolean
  reason: string | null
  chunks: RagChunk[]
}

export async function askRag(
  query: string,
  opts: { topic?: Topic; limit?: number } = {},
): Promise<RagReply> {
  const r = await fetch(`${BASE}/rag/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topic: opts.topic, limit: opts.limit ?? 5 }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`rag ${r.status}: ${text || r.statusText}`)
  }
  const data = (await r.json()) as RagReply
  return {
    text: data.text,
    blocked: Boolean(data.blocked),
    reason: data.reason ?? null,
    chunks: data.chunks ?? [],
  }
}

export async function health(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`)
    return r.ok
  } catch {
    return false
  }
}

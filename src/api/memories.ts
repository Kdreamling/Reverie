import { client } from './client'

export interface Memory {
  id: string
  content: string
  layer: 'core_base' | 'core_living' | 'scene' | 'ai_journal'
  scene_type?: string
  source: 'manual' | 'auto' | 'diary' | 'ai_tool'
  tags?: string[]
  ai_weight?: number
  base_importance?: number
  created_at: string
  updated_at: string
}

export async function fetchMemoriesAPI(layer?: string): Promise<Memory[]> {
  const params = layer ? `?layer=${layer}` : ''
  const res = await client.get<{ memories: Memory[] } | Memory[]>(`/memories${params}`)
  // 兼容后端可能返回包裹对象或直接数组
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object' && 'memories' in res) return (res as { memories: Memory[] }).memories
  return []
}

export async function createMemoryAPI(data: { content: string; layer: string; scene_type?: string }): Promise<Memory> {
  return client.post<Memory>('/memories', data)
}

export async function updateMemoryAPI(id: string, data: { content: string }): Promise<Memory> {
  return client.patch<Memory>(`/memories/${id}`, data)
}

export async function deleteMemoryAPI(id: string): Promise<void> {
  return client.delete<void>(`/memories/${id}`)
}

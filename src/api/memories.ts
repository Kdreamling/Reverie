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

// 后端 select("*") 会带回 embedding（1024 维 float），上千条数据时 JSON 几 MB，移动端会 OOM 白屏。
// 这里在前端兜底剥掉，永远不让它进 state。
function stripHeavy(m: any): Memory {
  if (m && typeof m === 'object') {
    const { embedding: _e, ...rest } = m
    return rest as Memory
  }
  return m
}

export async function fetchMemoriesAPI(layer?: string): Promise<Memory[]> {
  const params = layer ? `?layer=${layer}` : ''
  const res = await client.get<{ memories: Memory[] } | Memory[]>(`/memories${params}`)
  // 兼容后端可能返回包裹对象或直接数组
  let arr: Memory[] = []
  if (Array.isArray(res)) arr = res
  else if (res && typeof res === 'object' && 'memories' in res) arr = (res as { memories: Memory[] }).memories
  return arr.map(stripHeavy)
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

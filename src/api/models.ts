import { client } from './client'

export interface SelectableModel {
  value: string        // 传给后端的 model 字段（上游真实 id）
  label: string        // 前端显示名
  name: string         // gateway_models.name（内部条目 id）
  channel: string
  channel_tag?: string | null
}

export interface SelectableModelsResp {
  scene: string
  models: SelectableModel[]
}

/**
 * 拉取指定场景下可选的模型清单（从 gateway_models 表动态来）
 * scene: daily / rp / reading / dev / study
 */
export async function fetchSelectableModels(scene: string): Promise<SelectableModel[]> {
  try {
    const data = await client.get<SelectableModelsResp>(
      `/models/selectable?scene=${encodeURIComponent(scene)}`,
    )
    return data.models ?? []
  } catch {
    return []
  }
}

/** scene_type → selectable scene 的映射 */
export function sceneTypeToScene(sceneType: string | null | undefined): string {
  switch (sceneType) {
    case 'roleplay': return 'rp'
    case 'reading': return 'reading'
    case 'dev': return 'dev'
    case 'study': return 'study'
    default: return 'daily'
  }
}

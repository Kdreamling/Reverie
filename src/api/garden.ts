import { client } from './client'

export interface GardenState {
  user_id: string
  farm_name: string
  plot_rows: number
  plot_cols: number
  created_at: string
  updated_at: string
}

export interface GardenPlot {
  id: string
  user_id: string
  x: number
  y: number
  unlocked: boolean
  created_at: string
}

export interface GardenCrop {
  id: string
  user_id: string
  plot_id: string
  species: string
  stage: number            // 0..4
  planted_at: string
  last_watered_at: string
  last_grew_at: string
  harvested_at: string | null
  watered_by_chen_count: number
}

export interface GardenSeed {
  id: string
  user_id: string
  species: string
  count: number
}

export interface GardenAction {
  id: string
  user_id: string
  plot_id: string | null
  actor: 'dream' | 'chen'
  action: 'plant' | 'water' | 'harvest' | 'gift_seed' | 'visit'
  species: string | null
  note: string | null
  created_at: string
}

export interface CropDef {
  label: string
  emoji: string
  sprite_row: number
  hours_per_stage: number[]
}

export interface GardenView {
  state: GardenState
  plots: GardenPlot[]
  crops: GardenCrop[]
  seeds: GardenSeed[]
  recent_actions: GardenAction[]
  crop_defs: Record<string, CropDef>
}

export async function fetchGarden(): Promise<GardenView> {
  return client.get<GardenView>('/garden')
}

export async function plantCrop(plot_id: string, species: string) {
  return client.post<{ ok: boolean; crop: GardenCrop | null }>('/garden/plant', { plot_id, species })
}

export async function waterCrop(plot_id: string) {
  return client.post<{ ok: boolean }>('/garden/water', { plot_id })
}

export async function harvestCrop(plot_id: string) {
  return client.post<{ ok: boolean; species: string }>('/garden/harvest', { plot_id })
}

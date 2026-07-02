import { client } from './client'

export interface InventoryItem {
  name: string
  description?: string
  stat_bonus?: Record<string, number> | null
}

export interface PendingCheck {
  id: string
  attribute: string
  target: number
  action: string
  attr_value: number
  equip_bonus: number
  die: number
  session_id?: string
  created_at?: string
}

export interface RollResult extends PendingCheck {
  roll: number
  total: number
  success: boolean
  critical: 'success' | 'fail' | null
}

export interface CharacterState {
  name: string
  hp: { current: number; max: number }
  currency: { name: string; amount: number }
  total_points: number
  attributes: Record<string, number>
  inventory: InventoryItem[]
  status_effects: string[]
  dice_config: {
    base_die: number
    current_die: number
    crit_success: 'max' | number
    crit_fail: number
  }
  pending_check?: PendingCheck | null
}

export interface Project {
  id: string
  title: string
  tagline: string | null
  poster_theme: string
  system_prompt: string | null
  format_rules: string | null
  chapter_count: number
  status: string
  created_at: string
  updated_at: string
  character_state?: CharacterState | null
  files?: ProjectFile[]
  sessions?: ProjectSession[]
}

export interface ProjectFile {
  id: string
  project_id: string
  name: string
  content: string
  file_type: string
  priority: string
  sort_order: number
  created_at: string
}

export interface ProjectSession {
  id: string
  title: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export async function fetchProjectsAPI(): Promise<Project[]> {
  const res = await client.get<{ projects: Project[] }>('/projects')
  return res.projects
}

export async function fetchProjectAPI(id: string): Promise<Project> {
  return client.get<Project>(`/projects/${id}`)
}

export async function createProjectAPI(data: {
  title: string
  tagline?: string
  poster_theme?: string
}): Promise<Project> {
  return client.post<Project>('/projects', data)
}

export async function updateProjectAPI(
  id: string,
  data: Partial<Pick<Project, 'title' | 'tagline' | 'poster_theme' | 'system_prompt' | 'format_rules' | 'status'>>,
): Promise<Project> {
  return client.patch<Project>(`/projects/${id}`, data)
}

export async function deleteProjectAPI(id: string): Promise<void> {
  return client.delete<void>(`/projects/${id}`)
}

// 文件管理
export async function createProjectFileAPI(
  projectId: string,
  data: { name: string; content: string; file_type?: string; priority?: string },
): Promise<ProjectFile> {
  return client.post<ProjectFile>(`/projects/${projectId}/files`, data)
}

export async function updateProjectFileAPI(
  projectId: string,
  fileId: string,
  data: Partial<Pick<ProjectFile, 'name' | 'content' | 'file_type' | 'priority' | 'sort_order'>>,
): Promise<ProjectFile> {
  return client.patch<ProjectFile>(`/projects/${projectId}/files/${fileId}`, data)
}

export async function deleteProjectFileAPI(
  projectId: string,
  fileId: string,
): Promise<void> {
  return client.delete<void>(`/projects/${projectId}/files/${fileId}`)
}

// 角色状态
export async function fetchCharacterAPI(projectId: string): Promise<CharacterState | null> {
  const res = await client.get<{ ok: boolean; character_state: CharacterState | null }>(`/projects/${projectId}/character`)
  return res.character_state
}

export async function saveCharacterAPI(projectId: string, state: CharacterState): Promise<CharacterState> {
  const res = await client.put<{ ok: boolean; character_state: CharacterState }>(`/projects/${projectId}/character`, state)
  return res.character_state
}

// 掷骰：服务器掷（防刷新重掷），结果同时写进战报
export async function rollCheckAPI(projectId: string, checkId?: string): Promise<RollResult> {
  const res = await client.post<{ ok: boolean; result: RollResult }>(`/projects/${projectId}/roll`, { check_id: checkId ?? null })
  return res.result
}

// 故事笔记
export interface ProjectNote {
  id: string
  project_id: string
  chapter: number
  content: string
  note_type: string
  auto: boolean
  created_at: string
}

export async function fetchNotesAPI(projectId: string): Promise<ProjectNote[]> {
  const res = await client.get<{ ok: boolean; notes: ProjectNote[] }>(`/projects/${projectId}/notes`)
  return res.notes
}

export async function createNoteAPI(projectId: string, data: { content: string; chapter?: number; note_type?: string }): Promise<ProjectNote> {
  const res = await client.post<{ ok: boolean; note: ProjectNote }>(`/projects/${projectId}/notes`, data)
  return res.note
}

export async function deleteNoteAPI(projectId: string, noteId: string): Promise<void> {
  await client.delete<{ ok: boolean }>(`/projects/${projectId}/notes/${noteId}`)
}

// 项目内会话
export async function createProjectSessionAPI(projectId: string): Promise<ProjectSession> {
  return client.post<ProjectSession>(`/projects/${projectId}/sessions`, {})
}

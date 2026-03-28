import { client } from './client'

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

// 项目内会话
export async function createProjectSessionAPI(projectId: string): Promise<ProjectSession> {
  return client.post<ProjectSession>(`/projects/${projectId}/sessions`, {})
}

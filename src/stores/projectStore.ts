import { create } from 'zustand'
import {
  fetchProjectsAPI,
  fetchProjectAPI,
  createProjectAPI,
  updateProjectAPI,
  deleteProjectAPI,
  createProjectFileAPI,
  updateProjectFileAPI,
  deleteProjectFileAPI,
  createProjectSessionAPI,
  type Project,
  type ProjectFile,
} from '../api/projects'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean

  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (title: string, tagline?: string, posterTheme?: string) => Promise<Project>
  updateProject: (id: string, data: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  // 文件
  createFile: (projectId: string, data: { name: string; content: string; file_type?: string; priority?: string }) => Promise<ProjectFile>
  updateFile: (projectId: string, fileId: string, data: Partial<ProjectFile>) => Promise<void>
  deleteFile: (projectId: string, fileId: string) => Promise<void>

  // 会话
  createSession: (projectId: string) => Promise<string>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,

  async fetchProjects() {
    set({ loading: true })
    try {
      const projects = await fetchProjectsAPI()
      set({ projects, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async fetchProject(id) {
    const project = await fetchProjectAPI(id)
    set({ currentProject: project })
  },

  async createProject(title, tagline, posterTheme) {
    const project = await createProjectAPI({ title, tagline, poster_theme: posterTheme })
    set(s => ({ projects: [project, ...s.projects] }))
    return project
  },

  async updateProject(id, data) {
    await updateProjectAPI(id, data)
    // 刷新当前项目
    if (get().currentProject?.id === id) {
      await get().fetchProject(id)
    }
    await get().fetchProjects()
  },

  async deleteProject(id) {
    await deleteProjectAPI(id)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      currentProject: s.currentProject?.id === id ? null : s.currentProject,
    }))
  },

  async createFile(projectId, data) {
    const file = await createProjectFileAPI(projectId, data)
    // 刷新项目详情
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId)
    }
    return file
  },

  async updateFile(projectId, fileId, data) {
    await updateProjectFileAPI(projectId, fileId, data)
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId)
    }
  },

  async deleteFile(projectId, fileId) {
    await deleteProjectFileAPI(projectId, fileId)
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId)
    }
  },

  async createSession(projectId) {
    const session = await createProjectSessionAPI(projectId)
    // 刷新项目详情
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId)
    }
    return session.id
  },
}))

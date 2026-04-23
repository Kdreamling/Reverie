import { client } from './client'

export interface UserTool {
  id: string
  name: string
  description: string
  args_schema: Record<string, unknown>
  webhook_url: string
  headers: Record<string, string>
  method: string
  enabled: boolean
  created_at?: string
  updated_at?: string
}

export interface CreateToolPayload {
  name: string
  description: string
  args_schema: Record<string, unknown>
  webhook_url: string
  headers: Record<string, string>
  method: string
  enabled: boolean
}

export interface RegistrySnapshot {
  webhooks: Array<{ name: string; description: string; enabled: boolean; method: string; url: string }>
  mcp_tools: Array<{ name: string; server: string; description: string }>
}

export const userToolsApi = {
  list: () => client.get<{ tools: UserTool[] }>('/user-tools'),
  create: (payload: CreateToolPayload) =>
    client.post<{ tool: UserTool }>('/user-tools', payload),
  update: (id: string, patch: Partial<CreateToolPayload>) =>
    client.patch<{ tool: UserTool }>(`/user-tools/${id}`, patch),
  remove: (id: string) => client.delete<{ ok: true }>(`/user-tools/${id}`),
  test: (id: string, args: Record<string, unknown>) =>
    client.post<{ status: number; ok: boolean; body: unknown }>(
      `/user-tools/${id}/test`,
      { args }
    ),
  snapshot: () => client.get<RegistrySnapshot>('/user-tools/registry/snapshot'),
}

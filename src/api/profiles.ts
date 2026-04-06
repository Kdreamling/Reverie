import { client } from './client'

export interface Profile {
  id: string
  profile_type: 'user' | 'model'
  category: string
  content: string
  source: 'manual' | 'ai_generated'
  last_evidence: string
  status: 'active' | 'pending'
  created_at: string
  updated_at: string
}

export async function fetchProfilesAPI(type?: string, status?: string): Promise<Profile[]> {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (status) params.set('status', status)
  const qs = params.toString()
  const res = await client.get<{ profiles: Profile[] }>(`/profiles${qs ? `?${qs}` : ''}`)
  return res.profiles ?? []
}

export async function createProfileAPI(data: {
  profile_type: string
  category: string
  content: string
  last_evidence?: string
}): Promise<Profile> {
  return client.post<Profile>('/profiles', {
    ...data,
    source: 'manual',
    status: 'active',
  })
}

export async function updateProfileAPI(id: string, data: {
  content?: string
  status?: string
  category?: string
  last_evidence?: string
}): Promise<Profile> {
  return client.patch<Profile>(`/profiles/${id}`, data)
}

export async function deleteProfileAPI(id: string): Promise<void> {
  return client.delete<void>(`/profiles/${id}`)
}

import { client } from './client'

export interface Avatars {
  dream?: string
  claude?: string
}

export function getAvatars() {
  return client.get<Avatars>('/avatars')
}

export function saveAvatar(key: 'dream' | 'claude', dataUrl: string) {
  return client.post('/avatars', { key, data_url: dataUrl })
}

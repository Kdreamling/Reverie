import { client } from './client'

interface LoginResponse {
  token: string
  expires_at: string
}

export async function loginAPI(password: string): Promise<LoginResponse> {
  return client.post<LoginResponse>('/auth/login', { password })
}

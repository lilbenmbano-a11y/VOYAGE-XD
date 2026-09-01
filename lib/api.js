import axios from 'axios'
import { config } from '../config.js'

const client = axios.create({
  baseURL: config.api,
  timeout: 60000,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024
})

export async function apiGet(endpoint, params={}) {
  const res = await client.get(endpoint, { params })
  return res.data
}
export async function ai(prompt) {
  const data = await apiGet('/ai/compound', { q: prompt })
  return data?.result?.reply || data?.reply || 'AI did not return a response.'
}
export async function downloader(endpoint, params) {
  return apiGet(endpoint, params)
}
export async function unwrapApiMedia(data) {
  const result = data?.result ?? data?.data ?? data
  if (typeof result === 'string') return { url: result }
  const candidates = ['url','download','downloadUrl','download_url','link','media','video','audio','play','result']
  for (const k of candidates) {
    if (typeof result?.[k] === 'string' && /^https?:\/\//.test(result[k])) return { url: result[k] }
  }
  return result || {}
}

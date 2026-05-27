import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export const toPath = (url: string) => (url.startsWith('file://') ? fileURLToPath(url) : url)

const cwd = process.cwd()
export function removeCwdFromUrl(url: string) {
  try {
    const filePath = toPath(url)
    const relativePath = path.relative(cwd, filePath)
    return relativePath.startsWith('..') ? url : relativePath
  } catch (_: unknown) {
    return url
  }
}
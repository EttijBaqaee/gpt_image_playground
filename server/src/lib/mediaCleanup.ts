import fs from 'node:fs/promises'
import path from 'node:path'

const mediaKinds = ['uploads', 'masks', 'outputs', 'thumbs'] as const
const taskIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

async function removeEmptyDirectory(directory: string) {
  try {
    // rmdir is atomic and only removes an empty directory. Never recursively
    // delete a task directory: another write or an untracked file may remain.
    await fs.rmdir(directory)
    return 1
  } catch (error) {
    if (['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) return 0
    throw error
  }
}

async function collectionDirectory(mediaDir: string, kind: typeof mediaKinds[number]) {
  const directory = path.join(mediaDir, kind)
  const stat = await fs.lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  return stat?.isDirectory() && !stat.isSymbolicLink() ? directory : null
}

export async function cleanupEmptyTaskMediaDirectories(mediaDir: string, taskId: string) {
  if (!taskIdPattern.test(taskId)) return 0
  let removed = 0
  for (const kind of mediaKinds) {
    const directory = await collectionDirectory(mediaDir, kind)
    if (directory) removed += await removeEmptyDirectory(path.join(directory, taskId))
  }
  return removed
}

export async function cleanupDeletedTaskMediaDirectories(mediaDir: string, taskExists: (taskId: string) => boolean) {
  let removed = 0
  for (const kind of mediaKinds) {
    const directory = await collectionDirectory(mediaDir, kind)
    if (!directory) continue
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !taskIdPattern.test(entry.name) || taskExists(entry.name)) continue
      removed += await removeEmptyDirectory(path.join(directory, entry.name))
    }
  }
  return removed
}

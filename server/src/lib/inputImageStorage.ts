import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Stats } from 'node:fs'
import type { AppDatabase } from './db.js'

type Fingerprint = { sha256: string; bytes: number }
type Result = { merged: boolean; alreadyShared: boolean; bytesSaved: number }
type StorageState = { pending: Promise<unknown>; recent: Map<string, string> }
const states = new WeakMap<AppDatabase, Map<string, StorageState>>()

function storageState(db: AppDatabase, mediaDir: string) {
  let roots = states.get(db)
  if (!roots) { roots = new Map(); states.set(db, roots) }
  const root = path.resolve(mediaDir)
  let state = roots.get(root)
  if (!state) { state = { pending: Promise.resolve(), recent: new Map() }; roots.set(root, state) }
  return state
}

function serialize<T>(state: StorageState, operation: () => Promise<T>) {
  const result = state.pending.then(operation)
  state.pending = result.catch(() => undefined)
  return result
}

function remember(state: StorageState, key: string, relativePath: string) {
  state.recent.delete(key)
  state.recent.set(key, relativePath)
  if (state.recent.size > 128) state.recent.delete(state.recent.keys().next().value!)
}

function sameVersion(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

// Only real, regular files under uploads can be consolidated. In particular,
// never follow an imported symlink into another collection or outside media.
async function inputFile(mediaDir: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (!normalized.startsWith('uploads/') || normalized.split('/').some(part => !part || part === '.' || part === '..') || normalized.includes('\0')) {
    throw new Error('输入图路径无效')
  }
  const root = await fs.realpath(mediaDir)
  const absolutePath = path.resolve(root, normalized)
  const parent = await fs.realpath(path.dirname(absolutePath))
  if (path.relative(root, parent) !== path.dirname(normalized).split('/').join(path.sep)) throw new Error('输入图目录不能为符号链接')
  const stat = await fs.lstat(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('输入图必须为普通文件')
  return { absolutePath, stat }
}

async function hashFile(file: string): Promise<Fingerprint> {
  const handle = await fs.open(file, 'r')
  try {
    const before = await handle.stat()
    const hash = crypto.createHash('sha256')
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
    if (!sameVersion(before, await handle.stat())) throw new Error('输入图在检查期间发生变化')
    return { sha256: hash.digest('hex'), bytes: before.size }
  } finally { await handle.close() }
}

async function equalFiles(left: string, right: string) {
  const handles = await Promise.allSettled([fs.open(left, 'r'), fs.open(right, 'r')])
  try {
    const [a, b] = handles.map(result => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    })
    const beforeA = await a.stat(), beforeB = await b.stat()
    if (beforeA.size !== beforeB.size) return null
    const chunkA = Buffer.alloc(64 * 1024), chunkB = Buffer.alloc(64 * 1024)
    let position = 0
    while (position < beforeA.size) {
      const length = Math.min(chunkA.length, beforeA.size - position)
      // readFile-sized allocation is avoided even for unusually large uploads.
      const [readA, readB] = await Promise.all([a.read(chunkA, 0, length, position), b.read(chunkB, 0, length, position)])
      if (readA.bytesRead !== length || readB.bytesRead !== length || !chunkA.subarray(0, length).equals(chunkB.subarray(0, length))) return null
      position += length
    }
    if (!sameVersion(beforeA, await a.stat()) || !sameVersion(beforeB, await b.stat())) return null
    return { left: beforeA, right: beforeB }
  } finally {
    await Promise.all(handles.flatMap(result => result.status === 'fulfilled' ? [result.value.close()] : []))
  }
}

async function cleanupInterruptedLinks(mediaDir: string) {
  const taskId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
  const temporaryName = /^\.input-dedup-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.tmp$/i
  const root = await fs.realpath(mediaDir)
  const uploads = path.join(root, 'uploads')
  if ((await fs.realpath(uploads).catch(() => null)) !== uploads) return 0
  let cleaned = 0
  for (const task of await fs.readdir(uploads, { withFileTypes: true })) {
    if (!task.isDirectory() || !taskId.test(task.name)) continue
    for (const entry of await fs.readdir(path.join(uploads, task.name), { withFileTypes: true })) {
      if (!entry.isFile() || !temporaryName.test(entry.name)) continue
      const file = await inputFile(mediaDir, path.join('uploads', task.name, entry.name))
      await fs.unlink(file.absolutePath)
      cleaned++
    }
  }
  return cleaned
}

async function consolidate(db: AppDatabase, mediaDir: string, relativePath: string, fingerprint: Fingerprint, state: StorageState): Promise<Result> {
  const target = await inputFile(mediaDir, relativePath)
  const unchanged = { merged: false, alreadyShared: false, bytesSaved: 0 }
  if (target.stat.size !== fingerprint.bytes) throw new Error('输入图大小与检查结果不一致')
  const key = `${fingerprint.sha256}:${fingerprint.bytes}`
  // Recent paths also cover simultaneous uploads that have not committed their
  // task rows yet. Each upload owns a distinct link, including on rollback.
  const candidates = new Set([state.recent.get(key), ...db.findInputImagePaths(fingerprint.sha256, fingerprint.bytes)].filter((item): item is string => Boolean(item)))
  for (const candidatePath of candidates) {
    if (candidatePath.replace(/\\/g, '/') === relativePath.replace(/\\/g, '/')) continue
    let candidate
    try { candidate = await inputFile(mediaDir, candidatePath) } catch { continue }
    if (candidate.stat.dev !== target.stat.dev || candidate.stat.size !== target.stat.size) continue
    if (target.stat.ino !== 0 && candidate.stat.ino === target.stat.ino) {
      remember(state, key, relativePath)
      return { ...unchanged, alreadyShared: true }
    }
    const temporary = path.join(path.dirname(target.absolutePath), `.input-dedup-${crypto.randomUUID()}.tmp`)
    try {
      try { await fs.link(candidate.absolutePath, temporary) } catch (error) {
        // A task can unlink its reference after the candidate check. Try the
        // remaining references before falling back to an independent copy.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      // Hashes select candidates; byte comparison decides whether to merge.
      const equal = await equalFiles(temporary, target.absolutePath)
      if (!equal) continue
      const latest = await inputFile(mediaDir, relativePath)
      if (!sameVersion(equal.right, latest.stat)) throw new Error('输入图在合并期间发生变化')
      // Atomic replacement: on a failed link/compare/rename the original path
      // remains intact. No task ID, URL, permission or mask reference changes.
      await fs.rename(temporary, target.absolutePath)
      remember(state, key, candidatePath)
      return { merged: true, alreadyShared: false, bytesSaved: target.stat.nlink === 1 ? fingerprint.bytes : 0 }
    } finally { await fs.unlink(temporary).catch(() => undefined) }
  }
  remember(state, key, relativePath)
  return unchanged
}

export function deduplicateInputImageFile(db: AppDatabase, mediaDir: string, relativePath: string, fingerprint: Fingerprint) {
  const state = storageState(db, mediaDir)
  return serialize(state, () => consolidate(db, mediaDir, relativePath, fingerprint, state))
}

/** Scan all historical inputs, including records imported from older backups. */
export function deduplicateStoredInputImages(db: AppDatabase, mediaDir: string) {
  const state = storageState(db, mediaDir)
  return serialize(state, async () => {
    state.recent.clear()
    const result = { scanned: 0, merged: 0, alreadyShared: 0, bytesSaved: 0, missing: 0, skipped: 0, recoveredTemporaryLinks: 0 }
    try { result.recoveredTemporaryLinks = await cleanupInterruptedLinks(mediaDir) } catch { result.skipped++ }
    const fingerprints = new Map<string, Fingerprint>()
    for (const image of db.listStoredInputImages()) {
      try {
        const file = await inputFile(mediaDir, image.filePath)
        const inodeKey = `${file.stat.dev}:${file.stat.ino}:${file.stat.size}:${file.stat.mtimeMs}:${file.stat.ctimeMs}`
        const fingerprint = (file.stat.ino ? fingerprints.get(inodeKey) : undefined) ?? await hashFile(file.absolutePath)
        if (file.stat.ino) fingerprints.set(inodeKey, fingerprint)
        if (!sameVersion(file.stat, (await inputFile(mediaDir, image.filePath)).stat)) throw new Error('输入图在检查期间发生变化')
        db.updateInputImageFingerprint(image.id, image.filePath, fingerprint.sha256, fingerprint.bytes)
        result.scanned++
        const dedup = await consolidate(db, mediaDir, image.filePath, fingerprint, state)
        result.merged += Number(dedup.merged)
        result.alreadyShared += Number(dedup.alreadyShared)
        result.bytesSaved += dedup.bytesSaved
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') result.missing++
        else result.skipped++
      }
    }
    return result
  })
}

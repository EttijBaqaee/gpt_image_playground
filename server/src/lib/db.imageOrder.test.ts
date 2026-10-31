import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDatabase } from './db.js'

const resources: Array<() => void> = []
afterEach(() => { for (const cleanup of resources.splice(0).reverse()) cleanup() })
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gip-image-order-'))
  resources.push(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'test.db')
  let db = new AppDatabase(file)
  resources.push(() => db.sqlite.close())
  db.createTask({ id: 'test', prompt: 'order', paramsJson: '{}' })
  const ids = ['z-first', 'm-second', 'a-third']
  for (const id of ids) db.addTaskImage({ id, taskId: 'test', kind: 'input', filePath: id + '.png', mimeType: 'image/png', bytes: 1, sha256: id })
  db.sqlite.prepare('UPDATE task_images SET created_at = ?').run('2026-10-31T01:00:00.000Z')
  return { get db() { return db }, ids, reopen: () => { db.sqlite.close(); db = new AppDatabase(file); return db } }
}

describe('persistent reference image order', () => {
  it('keeps upload order when timestamps tie and random IDs sort in reverse', () => {
    const { db, ids } = setup()
    expect(db.listTaskImages('test').map((image) => image.id)).toEqual(ids)
    expect(db.listTaskImagesForTasks(['test']).map((image) => image.id)).toEqual(ids)
  })

  it('survives reopening and VACUUM without relying on rowid', () => {
    const context = setup()
    context.db.sqlite.exec('VACUUM')
    expect(context.reopen().listTaskImages('test').map((image) => image.id)).toEqual(context.ids)
    context.db.addTaskImage({ id: '0-later', taskId: 'test', kind: 'input', filePath: 'later.png', mimeType: 'image/png', bytes: 1, sha256: 'later' })
    expect(context.db.listTaskImages('test').map((image) => image.id)).toEqual([...context.ids, '0-later'])
  })

  it('upgrades a legacy database using original insertion order and is idempotent', () => {
    const context = setup()
    context.db.sqlite.exec('DROP INDEX idx_task_images_order; ALTER TABLE task_images DROP COLUMN sort_order')
    expect(context.reopen().listTaskImages('test').map((image) => image.id)).toEqual(context.ids)
    expect(context.db.listTaskImages('test').map((image) => image.sortOrder)).toEqual([0, 1, 2])
    expect(context.reopen().listTaskImages('test').map((image) => image.id)).toEqual(context.ids)
  })

  it('preserves explicit order when a backup is restored in shuffled array order', () => {
    const { db, ids } = setup()
    const task = db.getTask('test')!
    const images = db.listTaskImages('test').reverse()
    db.replaceImportedData({ tasks: [{ ...task, isFavorite: Boolean(task.isFavorite), isArchived: Boolean(task.isArchived) }], taskImages: images })
    expect(db.listTaskImages('test').map((image) => image.id)).toEqual(ids)
  })

  it('accepts old backup entries without sortOrder and retains their array order', () => {
    const { db, ids } = setup()
    const task = db.getTask('test')!
    const images = db.listTaskImages('test').map(({ sortOrder: _old, ...image }) => image)
    db.replaceImportedData({ tasks: [{ ...task, isFavorite: Boolean(task.isFavorite), isArchived: Boolean(task.isArchived) }], taskImages: images })
    expect(db.listTaskImages('test').map((image) => image.id)).toEqual(ids)
    expect(db.listTaskImages('test').map((image) => image.sortOrder)).toEqual([0, 1, 2])
  })

  it('keeps explicit image positions through full administrator backup restore', () => {
    const { db, ids } = setup()
    const task = db.getTask('test')!
    const images = db.listTaskImages('test').reverse()
    db.replaceFullBackup({
      providerProfiles: [], appSettings: [], usageCodes: [], usageQuotaEvents: [],
      usageCodeActivityLogs: [], taskEvents: [],
      tasks: [{ ...task, isFavorite: Boolean(task.isFavorite), isArchived: Boolean(task.isArchived) }],
      taskImages: images,
    })
    expect(db.listTaskImages('test').map((image) => image.id)).toEqual(ids)
  })
})

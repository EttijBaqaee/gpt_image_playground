import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredImage, TaskRecord } from './types'
import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from './types'
import { getSelectedImageMentionLabel } from './lib/promptImageMentions'

const mocks = vi.hoisted(() => ({ getImage: vi.fn(), storeImage: vi.fn(), createTask: vi.fn() }))
vi.mock('./lib/db', async (original) => ({
  ...await original<typeof import('./lib/db')>(),
  getImage: mocks.getImage,
  storeImage: mocks.storeImage,
  putImage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./lib/inputImagePreprocess', async (original) => ({
  ...await original<typeof import('./lib/inputImagePreprocess')>(),
  prepareInputImageDataUrl: vi.fn(async (dataUrl: string) => ({ dataUrl })),
  formatInputImageCompressionMessage: () => '',
}))
vi.mock('./lib/backendTasks', async (original) => ({
  ...await original<typeof import('./lib/backendTasks')>(),
  createBackendTask: mocks.createTask,
}))

import { addImagesFromFiles, restorePersistedInputDrafts, submitTask, useStore } from './store'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('reference image order across asynchronous operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getImage.mockReset()
    mocks.storeImage.mockReset().mockImplementation(async (data: string) => `id:${data}`)
    mocks.createTask.mockReset()
    useStore.setState({
      inputImages: [], pendingInputImages: 0, isSubmittingTask: false,
      prompt: 'test', maskDraft: null, maskEditorImageId: null, tasks: [],
      taskMode: 'image', params: { ...DEFAULT_PARAMS },
      settings: { ...DEFAULT_SETTINGS, providerProfileId: 'test', clearInputAfterSubmit: false },
      showToast: vi.fn(),
    })
    vi.stubGlobal('FileReader', class {
      result = ''
      onload?: () => void
      onerror?: (error: Error) => void
      readAsDataURL(file: File) {
        void file.text().then((value) => { this.result = value; this.onload?.() }, (error) => this.onerror?.(error))
      }
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const ids = () => useStore.getState().inputImages.map((image) => image.id)
  const file = (name: string) => new File([name], name, { type: 'image/png' })
  const record = (id: string) => ({ id, dataUrl: `data:${id}`, createdAt: 1 } as StoredImage)

  it('merges out-of-order draft reads into the latest order and keeps mentions attached', async () => {
    const a = deferred<StoredImage>(), b = deferred<StoredImage>()
    mocks.getImage.mockImplementation((id: string) => id === 'restore-a' ? a.promise : b.promise)
    useStore.getState().setInputImages([{ id: 'restore-a', dataUrl: '' }, { id: 'restore-b', dataUrl: '' }])
    useStore.getState().setPrompt(getSelectedImageMentionLabel(0))
    const restoring = restorePersistedInputDrafts()
    useStore.getState().moveInputImageById('restore-a', 'restore-b')
    b.resolve(record('restore-b'))
    await vi.waitFor(() => expect(useStore.getState().inputImages[0].dataUrl).toBe('data:restore-b'))
    a.resolve(record('restore-a'))
    await restoring
    expect(ids()).toEqual(['restore-b', 'restore-a'])
    expect(useStore.getState().prompt).toBe(getSelectedImageMentionLabel(1))
  })

  it('never resurrects removed images or removes newly added images when a draft read finishes', async () => {
    const read = deferred<StoredImage>()
    mocks.getImage.mockReturnValue(read.promise)
    useStore.getState().setInputImages([{ id: 'removed-draft', dataUrl: '' }])
    const restoring = restorePersistedInputDrafts()
    useStore.getState().removeInputImage(0)
    useStore.getState().addInputImage({ id: 'new', dataUrl: 'data:new' })
    read.resolve(record('removed-draft'))
    await restoring
    expect(ids()).toEqual(['new'])
  })

  it('does not overwrite a replacement with the same ID using an old draft response', async () => {
    const read = deferred<StoredImage>()
    mocks.getImage.mockReturnValue(read.promise)
    useStore.getState().setInputImages([{ id: 'replaced-draft', dataUrl: '' }])
    const restoring = restorePersistedInputDrafts()
    useStore.getState().replaceInputImage('replaced-draft', { id: 'replaced-draft', dataUrl: 'new content' })
    read.resolve(record('replaced-draft'))
    await restoring
    expect(useStore.getState().inputImages[0].dataUrl).toBe('new content')
  })

  it('removes only a missing draft and clears its mask', async () => {
    mocks.getImage.mockResolvedValue(undefined)
    useStore.getState().setInputImages([{ id: 'missing', dataUrl: '' }, { id: 'ready', dataUrl: 'ready' }])
    useStore.setState({ maskDraft: { targetImageId: 'missing', maskDataUrl: 'mask', updatedAt: 1 } })
    await restorePersistedInputDrafts()
    expect(ids()).toEqual(['ready'])
    expect(useStore.getState().maskDraft).toBeNull()
  })

  it('resolves drag IDs after concurrent removal and cancels a missing source', () => {
    useStore.getState().setInputImages(['a', 'b', 'c', 'd'].map((id) => ({ id, dataUrl: id })))
    useStore.getState().removeInputImage(0)
    useStore.getState().moveInputImageById('b', 'd')
    expect(ids()).toEqual(['c', 'd', 'b'])
    useStore.getState().moveInputImageById('a', 'c')
    expect(ids()).toEqual(['c', 'd', 'b'])
  })

  it('keeps the masked image first for ID-based touch and mouse moves', () => {
    useStore.getState().setInputImages(['a', 'b', 'c'].map((id) => ({ id, dataUrl: id })))
    useStore.setState({ maskDraft: { targetImageId: 'a', maskDataUrl: 'mask', updatedAt: 1 } })
    useStore.getState().moveInputImageById('a', 'c')
    useStore.getState().moveInputImageById('b', 'a')
    expect(ids()).toEqual(['a', 'b', 'c'])
  })

  it('tracks the entire unfinished file batch and appends without undoing a reorder', async () => {
    const slow = deferred<string>()
    mocks.storeImage.mockImplementation((data: string) => data === 'slow' ? slow.promise : Promise.resolve(`id:${data}`))
    useStore.getState().setInputImages(['a', 'b'].map((id) => ({ id, dataUrl: id })))
    const loading = addImagesFromFiles([file('slow'), file('later')])
    await vi.waitFor(() => expect(mocks.storeImage).toHaveBeenCalled())
    expect(useStore.getState().pendingInputImages).toBe(2)
    useStore.getState().moveInputImageById('a', 'b')
    await submitTask()
    expect(mocks.createTask).not.toHaveBeenCalled()
    slow.resolve('slow-id')
    await loading
    expect(ids()).toEqual(['b', 'a', 'slow-id', 'id:later'])
    expect(useStore.getState().pendingInputImages).toBe(0)
  })

  it('does not silently submit images whose draft data is still loading', async () => {
    useStore.getState().setInputImages([{ id: 'not-ready', dataUrl: '' }])
    await submitTask()
    expect(mocks.storeImage).not.toHaveBeenCalled()
    expect(mocks.createTask).not.toHaveBeenCalled()
    expect(useStore.getState().isSubmittingTask).toBe(false)
  })

  it('clears pending state on a failed file read and does not add the rest of a failed batch', async () => {
    mocks.storeImage.mockRejectedValue(new Error('storage failed'))
    await expect(addImagesFromFiles([file('bad'), file('skipped')])).rejects.toThrow('storage failed')
    expect(useStore.getState().pendingInputImages).toBe(0)
    expect(ids()).toEqual([])
  })

  it('clearing during import cancels unread files instead of bringing them back', async () => {
    const slow = deferred<string>()
    mocks.storeImage.mockReturnValue(slow.promise)
    const loading = addImagesFromFiles([file('slow'), file('unread')])
    await vi.waitFor(() => expect(mocks.storeImage).toHaveBeenCalled())
    useStore.getState().clearInputImages()
    expect(useStore.getState().pendingInputImages).toBe(0)
    slow.resolve('cancelled-id')
    await loading
    expect(ids()).toEqual([])
    expect(useStore.getState().pendingInputImages).toBe(0)
    expect(mocks.storeImage).toHaveBeenCalledTimes(1)
  })

  it('an old cancelled batch cannot decrement a newer batch pending count', async () => {
    const old = deferred<string>(), current = deferred<string>()
    mocks.storeImage.mockImplementation((data: string) => data === 'old' ? old.promise : current.promise)
    const oldBatch = addImagesFromFiles([file('old')])
    await vi.waitFor(() => expect(mocks.storeImage).toHaveBeenCalledTimes(1))
    useStore.getState().clearInputImages()
    const newBatch = addImagesFromFiles([file('new')])
    await vi.waitFor(() => expect(mocks.storeImage).toHaveBeenCalledTimes(2))
    old.resolve('discarded')
    await oldBatch
    expect(useStore.getState().pendingInputImages).toBe(1)
    current.resolve('current')
    await newBatch
    expect(useStore.getState().pendingInputImages).toBe(0)
    expect(ids()).toEqual(['current'])
  })

  it('locks order through a delayed upload, prevents duplicate submit and unlocks after failure', async () => {
    const upload = deferred<never>()
    mocks.createTask.mockReturnValue(upload.promise)
    useStore.getState().setInputImages(['a', 'b', 'c'].map((id) => ({ id, dataUrl: id })))
    useStore.getState().moveInputImageById('a', 'c')
    const submitting = submitTask()
    await vi.waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1))
    expect(mocks.createTask.mock.calls[0][0].inputImageDataUrls).toEqual(['b', 'c', 'a'])
    useStore.getState().moveInputImageById('b', 'a')
    useStore.getState().removeInputImage(0)
    useStore.getState().clearInputImages()
    await submitTask()
    expect(ids()).toEqual(['b', 'c', 'a'])
    expect(mocks.createTask).toHaveBeenCalledTimes(1)
    upload.reject(new Error('network disconnected'))
    await submitting
    expect(useStore.getState().isSubmittingTask).toBe(false)
    useStore.getState().moveInputImageById('b', 'a')
    expect(ids()).toEqual(['c', 'a', 'b'])
  })

  it('still clears inputs after successful upload when the existing preference requests it', async () => {
    const image = { id: 'a', dataUrl: 'a' }
    useStore.getState().setInputImages([image])
    useStore.getState().setSettings({ clearInputAfterSubmit: true })
    mocks.createTask.mockResolvedValue({ task: {
      id: 'task', inputImageIds: ['server-a'], outputImages: [], createdAt: 1,
    } as unknown as TaskRecord })
    await submitTask()
    expect(ids()).toEqual([])
    expect(useStore.getState().isSubmittingTask).toBe(false)
  })
})

import { useEffect, useRef, type RefObject } from 'react'

interface TouchImageSortOptions {
  onStart: (imageId: string) => boolean
  onTarget: (imageId: string | null) => void
  onDrop: (imageId: string, targetId: string) => void
  onEnd: () => void
}

/** Long press takes over the gesture; an ordinary swipe remains native scrolling. */
export function useTouchImageSort(
  containerRef: RefObject<HTMLElement | null>,
  options: TouchImageSortOptions,
) {
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    let gesture: {
      imageId: string
      identifier: number
      x: number
      y: number
      active: boolean
    } | null = null
    let timer: number | undefined
    let suppressClickUntil = 0
    let clickSuppressionTimer: number | undefined

    const thumbnailAt = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null
      const thumbnail = element?.closest<HTMLElement>('[data-input-image-id]')
      return thumbnail && containerRef.current?.contains(thumbnail) ? thumbnail : null
    }

    const targetAt = (x: number, y: number) =>
      thumbnailAt(document.elementFromPoint(x, y))?.dataset.inputImageId ?? null

    const finish = (targetId: string | null = null) => {
      window.clearTimeout(timer)
      const previous = gesture
      gesture = null
      if (!previous) return
      if (!previous.active) return
      // Also block compatibility clicks in browsers that synthesize one after a drag.
      window.clearTimeout(clickSuppressionTimer)
      suppressClickUntil = Date.now() + 700
      clickSuppressionTimer = window.setTimeout(() => {
        suppressClickUntil = 0
      }, 750)
      if (targetId) latest.current.onDrop(previous.imageId, targetId)
      latest.current.onEnd()
    }

    const start = (event: TouchEvent) => {
      if (gesture) finish()
      if (event.touches.length !== 1) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-input-image-action="delete"]')) return
      const imageId = thumbnailAt(target)?.dataset.inputImageId
      if (!imageId) return
      const touch = event.touches[0]
      const pending = { imageId, identifier: touch.identifier, x: touch.clientX, y: touch.clientY, active: false }
      gesture = pending
      timer = window.setTimeout(() => {
        if (gesture !== pending) return
        if (!latest.current.onStart(imageId)) {
          suppressClickUntil = Date.now() + 700
          window.clearTimeout(clickSuppressionTimer)
          clickSuppressionTimer = window.setTimeout(() => {
            suppressClickUntil = 0
          }, 750)
          finish()
          return
        }
        pending.active = true
        latest.current.onTarget(imageId)
      }, 450)
    }

    const move = (event: TouchEvent) => {
      if (!gesture) return
      const touch = Array.from(event.touches).find((item) => item.identifier === gesture?.identifier)
      if (event.touches.length !== 1 || !touch) {
        finish()
        return
      }
      if (!gesture.active) {
        if (Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 10) finish()
        return
      }
      if (event.cancelable) event.preventDefault()
      latest.current.onTarget(targetAt(touch.clientX, touch.clientY))
    }

    const end = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture?.identifier)
      if (!gesture || !touch) return
      if (gesture.active && event.cancelable) event.preventDefault()
      finish(gesture.active ? targetAt(touch.clientX, touch.clientY) : null)
    }

    const cancel = () => finish()
    const click = (event: MouseEvent) => {
      if (Date.now() >= suppressClickUntil || !containerRef.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const contextMenu = (event: Event) => {
      if (gesture && thumbnailAt(event.target)) event.preventDefault()
    }

    // Capture also sees touches on the selected thumbnail's edit overlay.
    // The non-passive move listener can stop scrolling after the hold activates,
    // without touch-action:none disabling ordinary swipes before that point.
    document.addEventListener('touchstart', start, { capture: true, passive: true })
    document.addEventListener('touchmove', move, { capture: true, passive: false })
    document.addEventListener('touchend', end, { capture: true, passive: false })
    document.addEventListener('touchcancel', cancel, true)
    document.addEventListener('click', click, true)
    document.addEventListener('contextmenu', contextMenu, true)
    document.addEventListener('visibilitychange', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(clickSuppressionTimer)
      document.removeEventListener('touchstart', start, true)
      document.removeEventListener('touchmove', move, true)
      document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', cancel, true)
      document.removeEventListener('click', click, true)
      document.removeEventListener('contextmenu', contextMenu, true)
      document.removeEventListener('visibilitychange', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [containerRef])
}

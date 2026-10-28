/** Read Chromium contenteditable blocks and BRs using the same offsets as selection. */
export function readPromptEditor(root: Node, visibleMentions = false) {
  let text = ''
  const boundaries = new Map<Node, number[]>()
  const starts = new Map<Node, number>()
  const isBlock = (node: Node) => node instanceof HTMLElement && /^(DIV|P|LI|PRE|BLOCKQUOTE)$/.test(node.tagName)
  const walk = (node: Node) => {
    starts.set(node, text.length)
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (node instanceof HTMLElement && node.classList.contains('mention-tag')) {
      text += visibleMentions ? node.textContent ?? '' : node.dataset.mentionText ?? node.textContent ?? ''
      return
    }
    if (node instanceof HTMLBRElement) {
      if (node.dataset.promptPlaceholder === 'true') return
      text += '\n'
      return
    }
    const children = Array.from(node.childNodes)
    const points: number[] = [text.length]
    boundaries.set(node, points)
    children.forEach((child, index) => {
      const block = isBlock(child)
      if (block && index > 0 && text && !text.endsWith('\n')) text += '\n'
      // A solitary BR is the browser's placeholder for an empty editable line.
      if (child instanceof HTMLBRElement && children.length === 1 && node instanceof HTMLElement && (isBlock(node) || node.isContentEditable)) {
        starts.set(child, text.length)
      } else {
        walk(child)
      }
      if (block && index < children.length - 1 && (!text.endsWith('\n') || !child.textContent && child.childNodes.length <= 1)) text += '\n'
      points.push(text.length)
    })
  }
  walk(root)
  return { text: text.replace(/\r\n?/g, '\n'), boundaries, starts }
}

export function promptEditorBoundaryOffset(root: HTMLElement, container: Node, offset: number) {
  const parsed = readPromptEditor(root, true)
  if (!root.contains(container) && root !== container) return parsed.text.length
  const element = container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement
  const mention = element?.closest('.mention-tag')
  if (mention && root.contains(mention)) {
    const range = document.createRange()
    range.selectNodeContents(mention)
    range.setEnd(container, offset)
    const length = mention.textContent?.length ?? 0
    return (parsed.starts.get(mention) ?? 0) + (range.toString().length < length / 2 ? 0 : length)
  }
  if (container.nodeType === Node.TEXT_NODE) return (parsed.starts.get(container) ?? 0) + offset
  return parsed.boundaries.get(container)?.[offset] ?? parsed.starts.get(container) ?? parsed.text.length
}

export function insertPromptPlainText(editor: HTMLElement, value: string) {
  const text = value.replace(/\r\n?/g, '\n')
  // Preserve the browser undo stack where insertText is supported.
  if (document.execCommand('insertText', false, text)) return
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

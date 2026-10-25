/** Answer of a QUESTION card, sent as the user's next chat message (unit-tested with node --test). */
export type QuestionOption = { label: string; description?: string; value?: string; garmentId?: string }

/**
 * Typed text wins when present. Otherwise single → the label of the first valid pick; multiple → the picked labels in
 * the order the assistant listed them, joined with "、". Unknown indexes and blank labels are ignored; '' when nothing is usable.
 */
export function answerText(options: QuestionOption[], picked: number[], custom = '', multiple = false, forModel = false): string {
  const typed = custom.trim()
  if (typed) return typed
  const valid = picked.filter(i => Number.isInteger(i) && i >= 0 && i < options.length && options[i].label.trim())
  if (!valid.length) return ''
  const text = (o: QuestionOption) => `${o.label.trim()}${forModel && o.garmentId ? `（garmentId: ${o.garmentId}）` : forModel && o.value ? `（value: ${o.value}）` : ''}`
  if (!multiple) return text(options[valid[0]])
  return [...new Set(valid)].sort((a, b) => a - b).map(i => text(options[i])).join('、')
}

/** Old conversations stored transport annotations in content. Keep these out of every user bubble. */
export function userMessageText(content: string): string {
  return content.replace(/（(?:garmentId|value):\s*[^）]*）/g, '').replace(/^选第\s*\d+\s*件「([^」]+)」$/, '选$1')
}

export function garmentAnswer(name: string, id: string) {
  return { text: `选${name}`, modelContent: `选${name}（garmentId: ${id}）` }
}

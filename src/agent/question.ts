/** Answer of a QUESTION card, sent as the user's next chat message (unit-tested with node --test). */
export type QuestionOption = { label: string; description?: string }

/**
 * Typed text wins when present. Otherwise single → the label of the first valid pick; multiple → the picked labels in
 * the order the assistant listed them, joined with "、". Unknown indexes and blank labels are ignored; '' when nothing is usable.
 */
export function answerText(options: QuestionOption[], picked: number[], custom = '', multiple = false): string {
  const typed = custom.trim()
  if (typed) return typed
  const valid = picked.filter(i => Number.isInteger(i) && i >= 0 && i < options.length && options[i].label.trim())
  if (!valid.length) return ''
  if (!multiple) return options[valid[0]].label.trim()
  return [...new Set(valid)].sort((a, b) => a - b).map(i => options[i].label.trim()).join('、')
}

/** Public, operator-prepared artwork only. Private creations never enter this type. */
export type PublicShowcase = { id: string; title: string; description: string; imageUrl: string; aiGenerated: true }

export function publicShowcases(value: unknown): PublicShowcase[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return []
  const items: PublicShowcase[] = [], seen = new Set<string>()
  for (const item of value.items.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue
    const { id, title, description, imageUrl, aiGenerated } = item
    // Exact path equality also rejects remote URLs, credentials, queries, fragments, traversal and encoded separators.
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || seen.has(id)) continue
    if (imageUrl !== `/api/public/creations/showcases/${id}/image` || aiGenerated !== true) continue
    if (typeof title !== 'string' || !title.trim() || typeof description !== 'string') continue
    seen.add(id)
    items.push({ id, title: title.trim(), description: description.trim(), imageUrl, aiGenerated: true })
  }
  return items
}

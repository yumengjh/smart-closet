/** Helpers for the wardrobe's hybrid search (server: GET /api/garments/search). Pure functions, unit-tested. */

export type ParsedQuery = { filters: Record<string, string[] | string>; freeText: string }
export type ImageStyleScope = { applied: string; dominant: string }
export type SearchTag = { key: string; label: string; words: string[]; imageStyle?: boolean }

export const IMAGE_STYLE_LABELS: Record<string, string> = { ALL: '全部风格', PHOTO: '写实实物', ILLUSTRATION: '卡通插画', SKETCH: '简笔线稿', OTHER: '其他风格' }
const ROLE_WORDS: Record<string, string[]> = { TOP: ['上衣', '上装'], INNER: ['上衣', '上装'], OUTER: ['外套', '外搭'], BOTTOM: ['下装'], SHOES: ['鞋子', '鞋'], BAG: ['包包', '包'], HAT: ['帽子'] }
const ROLE_LABELS: Record<string, string> = { TOP: '上装', INNER: '上装', OUTER: '外套', BOTTOM: '下装', SHOES: '鞋', BAG: '包', HAT: '帽子' }
const STYLE_WORDS: Record<string, string[]> = { ALL: ['全部风格', '所有风格', '不限风格'], PHOTO: ['写实', '实物照', '实物', '照片'], ILLUSTRATION: ['卡通化', '卡通', '插画', '动漫', '手绘', '二次元'], SKETCH: ['简笔画', '简笔', '线稿', '草图'] }

const list = (value: string[] | string | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value]

/** Dropdown filters are added to the text, so the server parses them exactly like typed words ("且" relation). */
export function combineQuery(q: string, ...filters: string[]): string {
  return [q.trim(), ...filters.filter(Boolean).filter(f => !q.includes(f))].filter(Boolean).join(' ')
}

/** Tags under the search box: one per understood condition; closing a tag removes its words from the query. */
export function buildTags(parsed: ParsedQuery | null, scope: ImageStyleScope | null): SearchTag[] {
  const tags: SearchTag[] = []
  if (parsed) {
    const f = parsed.filters
    for (const word of list(f.primaryColor)) tags.push({ key: `color:${word}`, label: `颜色：${word}`, words: [word, word.replace(/色$/, '')] })
    for (const word of list(f.category)) tags.push({ key: `category:${word}`, label: `品类：${word}`, words: [word] })
    const roles = [...new Set(list(f.role).map(r => ROLE_LABELS[r]).filter(Boolean))]
    for (const label of roles) tags.push({ key: `role:${label}`, label: `位置：${label}`, words: Object.entries(ROLE_WORDS).filter(([r]) => ROLE_LABELS[r] === label).flatMap(([, w]) => w) })
    for (const word of list(f.seasons)) tags.push({ key: `season:${word}`, label: `季节：${word}`, words: [`${word}天`, `${word}季`, word] })
    for (const word of list(f.styles)) tags.push({ key: `style:${word}`, label: `风格：${word}`, words: [word] })
    if (parsed.freeText) tags.push({ key: 'free', label: `描述：${parsed.freeText}`, words: parsed.freeText.split(/\s+/) })
  }
  if (scope && scope.applied !== 'ALL') {
    const label = IMAGE_STYLE_LABELS[scope.applied] || scope.applied
    tags.push({ key: 'imageStyle', label: `图片风格：${label}${scope.applied === scope.dominant ? '（衣柜中最多）' : ''}`, words: STYLE_WORDS[scope.applied] || [], imageStyle: true })
  }
  return tags
}

/** Removes a tag's words from the typed query (longest first, so "白色" goes before "白"). */
export function removeWords(q: string, words: string[]): string {
  let out = q
  for (const word of [...words].sort((a, b) => b.length - a.length)) if (word) out = out.split(word).join(' ')
  return out.replace(/的(\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
}

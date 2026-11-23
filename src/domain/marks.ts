/** 灵感、合集与衣物标记的纯规则（穿搭灵感设计 5.2、6.1），与服务端校验一致；单测见 tests/marks.test.ts。 */
export const MAX_TAGS = 6
export const MAX_TAG_LENGTH = 8
export const MAX_GARMENT_NOTE = 100
export const MAX_INSPIRATION_NOTE = 200
export const MAX_COLLECTION_NAME = 12
/** 第一次建合集时给出的建议名，点了才建（设计 5.2）。 */
export const COLLECTION_SUGGESTIONS = ['通勤', '约会', '旅行', '拍照']

/** 规整标签：去空白、去重、保留顺序；过长或超过数量的丢掉（服务端同样校验）。 */
export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const tag = raw.replace(/\s+/g, '')
    if (!tag || [...tag].length > MAX_TAG_LENGTH || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** “每次约 ¥X”：有价格且穿过才算，按整元四舍五入，不足 1 元写“不到 1 元”。 */
export function costPerWear(priceMinor: number | null | undefined, wearCount: number): string | null {
  if (priceMinor == null || priceMinor < 0 || wearCount <= 0) return null
  const yuan = priceMinor / 100 / wearCount
  if (yuan < 1) return '不到 ¥1'
  return `¥${Math.round(yuan)}`
}

export const yuanToMinor = (yuan: number | null | undefined) => yuan == null || Number.isNaN(yuan) ? null : Math.round(yuan * 100)
export const minorToYuan = (minor: number | null | undefined) => minor == null ? null : minor / 100

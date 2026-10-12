import type { BodyAdjustments } from '../services/platform'

export const BODY_DIMENSIONS: { key: keyof BodyAdjustments; label: string; less: string; more: string }[] = [
  { key: 'build', label: '整体', less: '更瘦', more: '更丰满' },
  { key: 'shoulders', label: '肩宽', less: '更窄', more: '更宽' },
  { key: 'waist', label: '腰围', less: '更细', more: '更粗' },
  { key: 'hips', label: '臀围', less: '更窄', more: '更宽' },
  { key: 'legs', label: '腿长', less: '更短', more: '更长' },
]

/** "整体稍瘦 · 腿更长" style summary of an adjustment, for result tags. */
export function describeAdjustments(values: BodyAdjustments | undefined) {
  if (!values) return ''
  return BODY_DIMENSIONS.filter(d => values[d.key]).map(d => {
    const v = values[d.key]!
    return `${d.label}${Math.abs(v) === 1 ? '稍' : ''}${(v < 0 ? d.less : d.more).replace(/^更/, Math.abs(v) === 1 ? '' : '更')}`
  }).join(' · ')
}

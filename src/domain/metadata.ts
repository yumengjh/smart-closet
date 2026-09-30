export type MetadataField = { key: string; label: string; options: string[]; multiple: boolean; suggestion: boolean }

export function metadataPatch(fields: MetadataField[], values: Record<string, string[]>, baseline: Record<string, unknown>, resetFields: string[]) {
  const patch: Record<string, string[]> = {}
  for (const field of fields) {
    if (resetFields.includes(field.key)) continue
    const next = (values[field.key] || []).map(value => value.trim()).filter(Boolean)
    if (JSON.stringify(next) !== JSON.stringify(baseline[field.key] || [])) patch[field.key] = next
  }
  return patch
}

export function rebaseMetadata(fields: MetadataField[], values: Record<string, string[]>, baseline: Record<string, unknown>, current: Record<string, unknown>) {
  return Object.fromEntries(fields.map(({ key }) => [key, JSON.stringify(values[key] || []) === JSON.stringify(baseline[key] || [])
    ? [...(current[key] as string[] || [])] : [...(values[key] || [])]]))
}

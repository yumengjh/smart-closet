import type { Baseline } from '../services/platform'

export function modelLabel(b: Pick<Baseline, 'name' | 'createdAt'>) { return b.name || `模特 · ${new Date(b.createdAt).toLocaleDateString()}` }

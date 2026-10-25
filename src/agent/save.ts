export type SaveChoice = { saveMode?: 'OVERWRITE' | 'NEW'; targetOutfitId?: string; targetName?: string; targetRevision?: number }

export function savePresentation(choice: SaveChoice) {
  if (choice.saveMode === 'OVERWRITE') {
    const target = `覆盖原搭配「${choice.targetName || '未命名搭配'}」`
    return { title: target, summary: `确认后将用当前搭配${target}，版本冲突时保留草稿。`, button: '确认覆盖' }
  }
  if (choice.saveMode === 'NEW') return { title: '另存为新搭配', summary: '确认后另存为新搭配，原搭配保留。', button: '确认另存' }
  return { title: '准备保存这份搭配？', summary: '确认后保存到你的账号', button: '确认保存' }
}

export function assertSaveTarget(choice: SaveChoice, context: { sourceOutfitId?: string; outfitId?: string; sourceRevision?: number | null; revision?: number | null }) {
  if (choice.saveMode !== 'OVERWRITE') return
  const target = context.sourceOutfitId || context.outfitId
  const revision = context.sourceOutfitId ? context.sourceRevision : context.revision
  if (!choice.targetOutfitId || target !== choice.targetOutfitId || revision !== choice.targetRevision) throw new Error('原搭配或版本已变化，请重新准备保存确认卡。')
}

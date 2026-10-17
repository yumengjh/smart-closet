/** The server (or the demo store) says the outfit being updated no longer exists, e.g. it was deleted elsewhere. */
export function isMissingOutfit(cause: unknown): boolean {
  return cause instanceof Error && /没有找到这套搭配|找不到这套搭配|这套搭配已被删除/.test(cause.message)
}

/** Numbers overlapping requests; only the newest ticket may write results, so a slow earlier response is dropped. */
export function latestRequest() {
  let current = 0
  return { next: () => ++current, isLatest: (ticket: number) => ticket === current }
}

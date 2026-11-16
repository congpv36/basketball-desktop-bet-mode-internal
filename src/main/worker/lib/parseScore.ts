export const parseScore = (score: string) => {
  if (!score) return 0
  return score
    .split('-')
    .map((n) => parseInt(n, 10) || 0)
    .reduce((a, b) => a + b, 0)
}

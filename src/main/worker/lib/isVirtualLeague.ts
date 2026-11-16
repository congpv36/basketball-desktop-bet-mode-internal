const VIRTUAL_LEAGUE_PATTERNS: RegExp[] = [
  /SABA/,
  /VIRTUAL/,
  /\bV-?BASKETBALL\b/,
  /\bE-?\s?SPORTS?\b/,
  /\bE-?\s?BASKETBALL\b/,
  /\bE-?LEAGUE\b/,
  /\bCYBER/,
  /\b(NBA\s?)?2K\d*\b/,
  /\bSIMULAT(ED|ION)\b/,
  /\bSRL\b/,
  /\bH2H\b/,
  /\bGG\s?LEAGUE\b/,
  /\bBATTLE\b/,
  /\bFANTASY\b/,
  /\b(?!3\s?X\s?3\b)\d+\s?X\s?\d+/,
  /\b\d+\s?(MINS?|MINUTES?)\b/,
  /\bMINS\b/
]

export const isVirtualLeague = (name: string): boolean => {
  const upper = name.toUpperCase()
  return VIRTUAL_LEAGUE_PATTERNS.some((pattern) => pattern.test(upper))
}

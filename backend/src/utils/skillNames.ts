export function normalizeSkillName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeSkillList(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeSkillName).filter(Boolean))]
}

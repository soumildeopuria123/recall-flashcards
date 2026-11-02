// Answer checking for type-the-answer exercises: forgiving the way a patient
// teacher is — case, accents, punctuation and stray spacing never count as
// wrong, and one keyboard slip in a long-enough word is a typo, not a miss.

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[.,!?;:'"()\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Bounded Levenshtein distance; bails out past `cap`. */
function edits(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let previous = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    const current = [j]
    let rowMin = j
    for (let i = 1; i <= a.length; i++) {
      current[i] = Math.min(previous[i] + 1, current[i - 1] + 1, previous[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, current[i])
    }
    if (rowMin > cap) return cap + 1
    previous = current
  }
  return previous[a.length]
}

/** Grading for typed answers. One typo in a word of 4+ letters is tolerated. */
/**
 * Whether a term can reasonably be typed on a Latin keyboard. Decks in
 * Japanese, Arabic, Thai and friends skip typing questions rather than asking
 * for a script the learner's keyboard cannot produce.
 */
export function isTypable(term: string): boolean {
  return /^[\p{Script=Latin}\p{N}\s'’.,!?¿¡;:\-–—/&()+]+$/u.test(term)
}

/** Grading for typed answers. One typo in a word of 4+ letters is tolerated. */
export function checkTyping(expected: string, input: string): boolean {
  const expectedNorm = normalize(expected)
  const typed = normalize(input)
  if (!typed) return false
  if (expectedNorm === typed) return true
  if (expectedNorm.length >= 4 && Math.abs(expectedNorm.length - typed.length) <= 1 && edits(expectedNorm, typed, 2) <= 1) return true
  return false
}

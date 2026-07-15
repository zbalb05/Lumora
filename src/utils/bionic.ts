/** Bionic reading: bold the leading ~45% of each word so the eye anchors on fewer letters per word. */
export function splitBionicWord(word: string): { bold: string; rest: string } {
  if (word.length <= 1) return { bold: word, rest: '' };
  const boldLength = Math.max(1, Math.ceil(word.length * 0.45));
  return { bold: word.slice(0, boldLength), rest: word.slice(boldLength) };
}

/** Strips markdown syntax (headers, bullets, emphasis) down to plain, speakable prose. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*]\s*/, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
    )
    .filter((line) => line.trim().length > 0)
    .join('. ');
}

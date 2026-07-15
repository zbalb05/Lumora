/** Joins "[Page: N]" / "[Timestamp: MM:SS]" source tags with a non-breaking space so they never wrap mid-tag. */
export function keepSourceTagsOnOneLine(text: string): string {
  return text.replace(
    /\[(Page|Timestamp):\s*([^\]]+)\]/g,
    (_match, label, value) => `[${label}: ${value.replace(/\s+/g, ' ')}]`
  );
}

/** Strips markdown emphasis markers (**bold**, *italic*, __bold__, _italic_), leaving plain text. */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/\*/g, ''); // drop any leftover unpaired asterisks (e.g. emphasis spanning multiple lines)
}

/**
 * Cleans a chat reply for display: strips heading/bullet/emphasis markdown syntax and collapses
 * runs of blank lines down to one, so a reply with multiple paragraph breaks doesn't render as a
 * bubble with a large empty gap in the middle.
 */
export function cleanChatText(text: string): string {
  const lines = text
    .split('\n')
    .filter((line) => !/^\s*[-*_]{3,}\s*$/.test(line)) // drop "---"/"***" horizontal-rule lines
    .map((line) => stripMarkdownEmphasis(line.replace(/^#{1,6}\s*/, '').replace(/^\s*[-*]\s+/, '• ')));

  return lines.filter((line, i) => !(line.trim() === '' && lines[i - 1]?.trim() === '')).join('\n');
}

/** Extracts the first "### Heading" line's text from generated notes, for use as a document/study-set title. */
export function extractHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,6}\s+(.+)$/m);
  return match ? stripMarkdownEmphasis(match[1]).trim() || null : null;
}

/** Splits a cleaned chat reply into paragraph chunks (blank-line separated), for one bubble per idea. */
export function splitParagraphs(cleanedText: string): string[] {
  return cleanedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}


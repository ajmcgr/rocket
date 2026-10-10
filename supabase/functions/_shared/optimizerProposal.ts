const connectiveWords = new Set([
  "a", "about", "also", "an", "and", "are", "as", "at", "be", "by", "each", "for",
  "from", "in", "into", "is", "it", "its", "more", "most", "of", "on", "only", "or",
  "our", "over", "than", "that", "the", "their", "them", "then", "they", "this",
  "to", "us", "we", "what", "when", "where", "which", "while", "with", "within",
  "without", "you", "your",
]);

const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

// Applyable copy may rearrange or shorten existing claims, but cannot introduce
// a new substantive term that could imply an unverified product capability.
export function safeProposedDescription(proposal: unknown, currentDescription: unknown): string | null {
  if (typeof proposal !== "string" || typeof currentDescription !== "string") return null;
  const text = proposal.trim();
  if (text.length < 20 || text.length > 2000 || !currentDescription.trim()) return null;
  const existing = new Set(words(currentDescription));
  return words(text).every((word) => connectiveWords.has(word) || existing.has(word))
    ? text
    : null;
}

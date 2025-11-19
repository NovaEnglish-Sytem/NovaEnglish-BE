export function stripHtml(input) {
  if (input == null) return input
  const s = String(input)
  // Remove tags and decode basic entities
  const noTags = s.replace(/<[^>]*>/g, '')
  const decoded = noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
  return decoded.trim()
}

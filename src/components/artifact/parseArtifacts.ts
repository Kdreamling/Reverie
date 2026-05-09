/**
 * Parse artifact blocks from AI response content.
 * Supports XML format: <artifact type="..." title="..." language="...">content</artifact>
 * and JSON block format: ```artifact\n{...}\n```
 */

export interface ParsedArtifact {
  type: string
  title: string
  language?: string
  content: string
  ref?: string
  version?: number
}

export interface ParseResult {
  artifacts: ParsedArtifact[]
  /** Content with artifact blocks replaced by placeholders like {{ARTIFACT_0}} */
  cleanContent: string
}

function extractAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"` ))
  return match?.[1] || undefined
}

const MIME_TO_TYPE: Record<string, string> = {
  'text/html': 'html',
  'text/css': 'code',
  'text/csv': 'csv',
  'text/markdown': 'markdown',
  'image/svg+xml': 'svg',
  'application/json': 'code',
  'text/javascript': 'code',
}

function normalizeType(raw: string): string {
  return MIME_TO_TYPE[raw] || raw
}

function parseXMLArtifacts(content: string): ParseResult {
  const artifacts: ParsedArtifact[] = []
  let cleanContent = content
  let index = 0

  // Match <artifact ...attributes...>content</artifact> with any attribute order
  const regex = /<artifact\s+([^>]+)>([\s\S]*?)<\/artifact>/g
  let match

  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1]
    const type = extractAttr(attrs, 'type')
    const title = extractAttr(attrs, 'title')
    if (!type || !title) continue

    artifacts.push({
      type: normalizeType(type),
      title,
      language: extractAttr(attrs, 'language'),
      ref: extractAttr(attrs, 'ref'),
      version: extractAttr(attrs, 'version') ? parseInt(extractAttr(attrs, 'version')!) : undefined,
      content: match[2].trim(),
    })
    cleanContent = cleanContent.replace(match[0], `{{ARTIFACT_${index}}}`)
    index++
  }

  return { artifacts, cleanContent }
}

function parseJSONArtifacts(content: string): ParseResult {
  const artifacts: ParsedArtifact[] = []
  const regex = /```artifact\n(\{[\s\S]*?\})\n```/g

  let match
  let cleanContent = content
  let index = 0

  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      artifacts.push({
        type: normalizeType(parsed.type || 'code'),
        title: parsed.title || 'Untitled',
        language: parsed.language,
        content: parsed.content || '',
      })
      cleanContent = cleanContent.replace(match[0], `{{ARTIFACT_${index}}}`)
      index++
    } catch {
      // skip invalid JSON
    }
  }

  return { artifacts, cleanContent }
}

export function parseArtifacts(content: string): ParseResult {
  // Try XML format first
  const xmlResult = parseXMLArtifacts(content)
  if (xmlResult.artifacts.length > 0) return xmlResult

  // Fallback to JSON block format
  const jsonResult = parseJSONArtifacts(content)
  if (jsonResult.artifacts.length > 0) return jsonResult

  return { artifacts: [], cleanContent: content }
}

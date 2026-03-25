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

function parseXMLArtifacts(content: string): ParseResult {
  const artifacts: ParsedArtifact[] = []
  const regex = /<artifact\s+type="(\w+)"\s+title="([^"]+)"(?:\s+language="([^"]+)")?(?:\s+ref="([^"]+)")?(?:\s+version="(\d+)")?\s*>([\s\S]*?)<\/artifact>/g

  let match
  let cleanContent = content
  let index = 0

  while ((match = regex.exec(content)) !== null) {
    artifacts.push({
      type: match[1],
      title: match[2],
      language: match[3] || undefined,
      ref: match[4] || undefined,
      version: match[5] ? parseInt(match[5]) : undefined,
      content: match[6].trim(),
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
        type: parsed.type || 'code',
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

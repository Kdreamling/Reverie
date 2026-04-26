// File → text parser for the reading upload flow.
// Supports .txt / .md / .pdf / .docx
//
// pdfjs and mammoth are loaded dynamically — they only show up in the bundle
// when the user actually uploads a file, keeping the initial chat bundle small.

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'] as const

export class UnsupportedFormatError extends Error {
  constructor(public ext: string) {
    super(`Unsupported file format: ${ext}`)
  }
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

export function getBaseName(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(0, i) : filename
}

function isCJK(ch: string): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  return (code >= 0x3000 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF)
}

// Join two visual lines from the same paragraph into one continuous string.
// CJK: no separator. English hyphenated word break: drop the hyphen. Otherwise: single space.
function joinLines(prev: string, next: string): string {
  if (!prev) return next
  if (!next) return prev
  const last = prev[prev.length - 1]
  const first = next[0]
  if (last === '-' && /[a-zA-Z]/.test(first)) return prev.slice(0, -1) + next
  if (isCJK(last) || isCJK(first)) return prev + next
  return prev + ' ' + next
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/chat/pdf.worker.js'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Stage 1 — aggregate items into visual lines.
    // pdfjs flags line ends with `hasEOL`; for older builds we also detect
    // line breaks by y-coordinate changes in the transform matrix.
    type Line = { y: number; text: string; height: number }
    const lines: Line[] = []
    let buf = ''
    let lineY = 0
    let lineH = 0
    let prevY: number | null = null

    const flushLine = () => {
      if (buf.trim()) lines.push({ y: lineY, text: buf, height: lineH || 12 })
      buf = ''
      lineY = 0
      lineH = 0
      prevY = null
    }

    for (const raw of content.items) {
      const item = raw as { str?: string; hasEOL?: boolean; transform?: number[]; height?: number }
      const str = item.str ?? ''
      const y = item.transform ? item.transform[5] : null
      const h = item.height ?? 0

      // Detect implicit line break by y-jump (fallback when hasEOL missing)
      if (y !== null && prevY !== null && Math.abs(y - prevY) > 2 && buf) {
        flushLine()
      }

      buf += str
      if (y !== null) {
        lineY = y
        prevY = y
      }
      if (h) lineH = Math.max(lineH, h)

      if (item.hasEOL) flushLine()
    }
    flushLine()

    // Stage 2 — merge consecutive lines into paragraphs by vertical gap.
    // Gap > 1.5 × line height ⇒ paragraph break.
    const paragraphs: string[] = []
    let para = ''
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j]
      const next = lines[j + 1]
      para = joinLines(para, line.text.trim())
      const gap = next ? line.y - next.y : Infinity
      const refH = next ? Math.max(line.height, next.height) : line.height
      if (gap > refH * 1.5) {
        if (para.trim()) paragraphs.push(para.trim())
        para = ''
      }
    }
    if (para.trim()) paragraphs.push(para.trim())

    if (paragraphs.length) pageTexts.push(paragraphs.join('\n\n'))
  }

  return pageTexts.join('\n\n')
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

export async function parseFileToText(file: File): Promise<string> {
  const ext = extOf(file.name)

  if (ext === '.txt' || ext === '.md') {
    return await file.text()
  }
  if (ext === '.pdf') {
    return await parsePdf(file)
  }
  if (ext === '.docx') {
    return await parseDocx(file)
  }
  throw new UnsupportedFormatError(ext || '(unknown)')
}

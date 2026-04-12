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

async function parsePdf(file: File): Promise<string> {
  // Use the legacy build — compiled to ES2017, works on older Safari / iOS
  // versions that don't have Promise.withResolvers etc.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Worker is served from public/ as .js (NOT .mjs) so nginx returns the
  // correct application/javascript MIME — Safari refuses module workers
  // served as application/octet-stream (the default for .mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = '/chat/pdf.worker.js'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .trim()
    if (text) parts.push(text)
  }
  return parts.join('\n\n')
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

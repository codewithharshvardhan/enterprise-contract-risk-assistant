import path from 'node:path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt']

/**
 * Extracts plain text from an uploaded contract file. Extension is checked
 * first (browsers/clients send unreliable or generic mimetypes for
 * .docx/.txt), falling back to mimetype when the extension is absent.
 */
export async function extractTextFromFile(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase()

  if (ext === '.pdf' || (!ext && mimetype === 'application/pdf')) {
    const data = await pdfParse(buffer)
    return data.text
  }
  if (ext === '.docx' || (!ext && mimetype.includes('officedocument.wordprocessingml'))) {
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }
  if (ext === '.txt' || (!ext && mimetype === 'text/plain')) {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported file type "${ext || mimetype || 'unknown'}". Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`)
}

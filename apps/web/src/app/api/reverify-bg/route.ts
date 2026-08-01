import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const artifactPath = `C:\\Users\\Shaam$\\.gemini\\antigravity-ide\\brain\\9da4f1f6-770d-4047-8d84-5e940d528e2a\\media__1785611413071.png`
  const publicPath = path.join(process.cwd(), 'public', 'media', 'reverify-bg.png')

  try {
    if (fs.existsSync(artifactPath)) {
      const imageBuffer = fs.readFileSync(artifactPath)
      try {
        fs.mkdirSync(path.dirname(publicPath), { recursive: true })
        fs.writeFileSync(publicPath, imageBuffer)
      } catch {
        // ignore copy error
      }
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    if (fs.existsSync(publicPath)) {
      const imageBuffer = fs.readFileSync(publicPath)
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    return new NextResponse('Image not found', { status: 404 })
  } catch (err) {
    return new NextResponse('Error reading image file', { status: 500 })
  }
}

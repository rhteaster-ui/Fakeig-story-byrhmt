import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import os from 'os'

async function ensureFile(url, filePath) {
  if (fs.existsSync(filePath)) return

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch asset: ${url} (${res.status})`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(filePath, buf)
}

async function generate(pp, name, text) {
  const tmpDir = os.tmpdir()
  const fontDir = path.join(tmpDir, 'font')
  const bgPath = path.join(tmpDir, 'bg-template.jpg')
  const fontSBPath = path.join(fontDir, 'Inter-SemiBold.otf')
  const fontBPath = path.join(fontDir, 'Inter-Bold.otf')

  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true })

  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/Inter-SemiBold.otf', fontSBPath)
  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/Inter-Bold.otf', fontBPath)
  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/_20260430144912806.jpg', bgPath)

  // @napi-rs/canvas pakai GlobalFonts.registerFromPath
  GlobalFonts.registerFromPath(fontSBPath, 'Inter-SB')
  GlobalFonts.registerFromPath(fontBPath, 'Inter-B')

  let bg = await loadImage(bgPath)
  let avatar = await loadImage(pp)

  // @napi-rs/canvas pakai createCanvas bukan new Canvas
  let canvas = createCanvas(bg.width, bg.height)
  let ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(bg, 0, 0)

  let header = { x: 115, y: 385, gap: 25 }
  let p = { cx: header.x, cy: header.y, r: 65 }

  // Safe Zone — edit 3 nilai ini untuk menyesuaikan area teks
  const SAFE_PADDING_X      = 100  // jarak kiri & kanan
  const SAFE_PADDING_TOP    = 480  // batas atas (dari atas canvas)
  const SAFE_PADDING_BOTTOM = 480  // batas bawah (dari bawah canvas)

  let safeLeft = SAFE_PADDING_X
  let safeRight = bg.width - SAFE_PADDING_X
  let safeTop = SAFE_PADDING_TOP
  let safeBottom = bg.height - SAFE_PADDING_BOTTOM
  let safeW = safeRight - safeLeft
  let safeH = safeBottom - safeTop
  let safeCX = bg.width / 2
  let safeCY = (safeTop + safeBottom) / 2

  // Avatar
  let s = Math.min(avatar.width, avatar.height)
  let sx = (avatar.width - s) / 2
  let sy = (avatar.height - s) / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(avatar, sx, sy, s, s, p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2)
  ctx.restore()

  // Nama
  ctx.font = 'bold 55px "Inter-SB"'
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(name, p.cx + p.r + header.gap, p.cy)

  // Parse input jadi array token: { text, red }
  function parseTokens(input) {
    let tokens = []
    let regex = /\(([^)]*)\)/g
    let last = 0, match
    while ((match = regex.exec(input)) !== null) {
      if (match.index > last) tokens.push({ text: input.slice(last, match.index), red: false })
      tokens.push({ text: match[1], red: true })
      last = regex.lastIndex
    }
    if (last < input.length) tokens.push({ text: input.slice(last), red: false })
    return tokens
  }

  // Ukur lebar satu token dengan font yang sesuai
  function measureToken(ctx, token, fsz) {
    ctx.font = `bold ${fsz}px "${token.red ? 'Inter-B' : 'Inter-SB'}"`
    return ctx.measureText(token.text).width
  }

  // Wrap token-token jadi baris, setiap baris = array segment { text, red }
  function wrapTokens(ctx, tokens, maxWidth, fsz) {
    let lines = []      // hasil: array of array of { text, red }
    let curLine = []    // segmen di baris saat ini
    let curW = 0

    // Pecah semua token jadi per-kata dulu
    let words = []
    for (let tok of tokens) {
      let parts = tok.text.split(/(\s+)/)
      for (let p of parts) {
        if (p === '') continue
        words.push({ text: p, red: tok.red })
      }
    }

    for (let word of words) {
      // Spasi murni: langsung tambah ke baris saat ini
      if (/^\s+$/.test(word.text)) {
        if (curLine.length > 0) {
          ctx.font = `bold ${fsz}px "Inter-SB"`
          let spaceW = ctx.measureText(' ').width
          curW += spaceW
          let last = curLine[curLine.length - 1]
          if (last.red === word.red) last.text += word.text
          else curLine.push({ text: word.text, red: word.red })
        }
        continue
      }

      ctx.font = `bold ${fsz}px "${word.red ? 'Inter-B' : 'Inter-SB'}"`
      let wordW = ctx.measureText(word.text).width
      ctx.font = `bold ${fsz}px "Inter-SB"`
      let spaceW = ctx.measureText(' ').width

      let addW = curLine.length > 0 ? spaceW + wordW : wordW

      if (curW + addW > maxWidth && curLine.length > 0) {
        // Potong spasi trailing di baris
        lines.push(curLine)
        curLine = [{ text: word.text, red: word.red }]
        curW = wordW
      } else {
        if (curLine.length > 0) {
          // Tambah spasi sebelum kata
          let last = curLine[curLine.length - 1]
          if (last.red === word.red) {
            last.text += ' ' + word.text
          } else {
            curLine.push({ text: ' ', red: false })
            curLine.push({ text: word.text, red: word.red })
          }
          curW += spaceW + wordW
        } else {
          curLine.push({ text: word.text, red: word.red })
          curW = wordW
        }
      }
    }
    if (curLine.length > 0) lines.push(curLine)
    return lines
  }

  // Hitung total lebar satu baris (array segment)
  function lineWidth(ctx, segments, fsz) {
    return segments.reduce((sum, seg) => {
      ctx.font = `bold ${fsz}px "${seg.red ? 'Inter-B' : 'Inter-SB'}"`
      return sum + ctx.measureText(seg.text).width
    }, 0)
  }

  function drawScaledText(ctx, input) {
    let tokens = parseTokens(input.trim())

    const MAX_FONT = 65
    const MIN_FONT = 18
    let fsz = MAX_FONT
    let lines, totalH, lh

    // Auto-scale: kecilkan font sampai semua baris muat di safe zone
    do {
      lh = fsz * 1.25
      lines = wrapTokens(ctx, tokens, safeW, fsz)
      totalH = lines.length * lh
      if (totalH <= safeH) break
      fsz -= 1
    } while (fsz > MIN_FONT)

    // Fallback: potong baris terakhir dengan '...' jika masih melebihi
    if (totalH > safeH) {
      const maxLines = Math.floor(safeH / lh)
      lines = lines.slice(0, maxLines)
      if (lines.length > 0) {
        let lastLine = lines[lines.length - 1]
        ctx.font = `bold ${fsz}px "Inter-SB"`
        let dotsW = ctx.measureText('...').width
        while (lineWidth(ctx, lastLine, fsz) + dotsW > safeW) {
          let last = lastLine[lastLine.length - 1]
          if (last.text.length > 1) {
            last.text = last.text.slice(0, -1).trimEnd()
          } else {
            lastLine.pop()
            if (lastLine.length === 0) break
          }
        }
        lastLine.push({ text: '...', red: false })
      }
      totalH = lines.length * lh
    }

    // Render: tiap baris di-center, tiap segmen digambar per warna
    let startY = safeCY - totalH / 2 + lh / 2
    ctx.textBaseline = 'middle'

    for (let i = 0; i < lines.length; i++) {
      let segments = lines[i]
      let totalW = lineWidth(ctx, segments, fsz)
      let x = safeCX - totalW / 2
      let y = startY + i * lh

      for (let seg of segments) {
        ctx.font = `bold ${fsz}px "${seg.red ? 'Inter-B' : 'Inter-SB'}"`
        ctx.fillStyle = seg.red ? '#e51a1a' : '#000000'
        ctx.textAlign = 'left'
        ctx.fillText(seg.text, x, y)
        x += ctx.measureText(seg.text).width
      }
    }
  }

  drawScaledText(ctx, text)
  // @napi-rs/canvas: toBuffer pakai encode('png') atau await canvas.encode('png')
  return await canvas.encode('png')
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const input = args.join(' ')
  if (!input) process.exit(0)

  const testPP = 'https://raw.githubusercontent.com/uploader762/dat4/main/uploads/e0f993-1777126212302.jpg'
  generate(testPP, 'Someone', input).then(buffer => {
    fs.writeFileSync('./test_result.png', buffer)
  })
}

export default { help: ['igstory'], command: ['igstory'], tags: ['maker'], run: generate }

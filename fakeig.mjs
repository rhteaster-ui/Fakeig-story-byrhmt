import { Canvas, loadImage, FontLibrary } from 'skia-canvas'
import fs from 'fs'
import { fileURLToPath } from 'url'

async function ensureFile(url, path) {
  if (!fs.existsSync(path)) {
    const res = await fetch(url)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(path, buf)
  }
}

async function generate(pp, name, text) {
  if (!fs.existsSync('./font')) fs.mkdirSync('./font')

  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/Inter-SemiBold.otf', './font/Inter-SemiBold.otf')
  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/Inter-Bold.otf', './font/Inter-Bold.otf')
  await ensureFile('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/_20260430144912806.jpg', './bg-template.jpg')

  FontLibrary.use('Inter-SB', ['./font/Inter-SemiBold.otf'])
  FontLibrary.use('Inter-B', ['./font/Inter-Bold.otf'])

  let bg = await loadImage('./bg-template.jpg')
  let avatar = await loadImage(pp)

  let canvas = new Canvas(bg.width, bg.height)
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

  // Wrap token-token jadi baris yang bebas dari spasi nyasar/newline
  function wrapTokens(ctx, tokens, maxWidth, fsz) {
    let lines = []
    let curLine = []
    let curW = 0
    ctx.font = `bold ${fsz}px "Inter-SB"`
    let spaceW = ctx.measureText(' ').width

    for (let tok of tokens) {
      // Pisahkan berdasarkan newline (\n) dan spasi
      let parts = tok.text.split(/(\n|\s+)/)
      
      for (let p of parts) {
        if (!p) continue

        // Handle Newline Manual (Enter)
        if (p.includes('\n')) {
          let newlines = p.match(/\n/g).length
          for (let i = 0; i < newlines; i++) {
            if (curLine.length > 0 && curLine[curLine.length - 1].text === ' ') curLine.pop()
            lines.push(curLine)
            curLine = []
            curW = 0
          }
          continue
        }

        // Handle Spasi
        if (/^\s+$/.test(p)) {
          if (curLine.length > 0 && curLine[curLine.length - 1].text !== ' ') {
            curLine.push({ text: ' ', red: false })
            curW += spaceW
          }
          continue
        }

        // Handle Kata Biasa
        ctx.font = `bold ${fsz}px "${tok.red ? 'Inter-B' : 'Inter-SB'}"`
        let wordW = ctx.measureText(p).width

        if (curLine.length > 0 && curW + wordW > maxWidth) {
          if (curLine[curLine.length - 1].text === ' ') curLine.pop()
          lines.push(curLine)
          curLine = [{ text: p, red: tok.red }]
          curW = wordW
        } else {
          curLine.push({ text: p, red: tok.red })
          curW += wordW
        }
      }
    }
    
    if (curLine.length > 0) {
      if (curLine[curLine.length - 1].text === ' ') curLine.pop()
      if (curLine.length > 0) lines.push(curLine)
    }
    
    return lines
  }

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
      
      // Lewati baris kosong biar gak error kalkulasi center
      if (segments.length === 0) continue

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
  return await canvas.toBuffer('png')
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

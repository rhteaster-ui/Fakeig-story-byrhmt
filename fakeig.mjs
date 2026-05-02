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

  // @napi-rs/canvas pakai createCanvas
  let canvas = createCanvas(bg.width, bg.height)
  let ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(bg, 0, 0)

  // Pembaruan ukuran dari owner script
  let header = { x: 115, y: 388, gap: 25 }
  let p = { cx: header.x, cy: header.y, r: 68 }

  // Safe Zone
  const SAFE_PADDING_X      = 100
  const SAFE_PADDING_TOP    = 480
  const SAFE_PADDING_BOTTOM = 480

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

  // Parse input jadi array token
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

  // --- LOGIKA ANTI MIRING (Otomatis hapus spasi nyasar) ---
  function buildLines(ctx, textInput, maxWidth, fsz) {
    let lines = []
    let paragraphs = textInput.split('\n')

    for (let para of paragraphs) {
      if (para.trim() === '') {
        lines.push([]) 
        continue
      }

      let tokens = parseTokens(para)
      let curLine = []
      let curW = 0

      for (let tok of tokens) {
        let parts = tok.text.split(/(\s+)/).filter(Boolean)

        for (let part of parts) {
          ctx.font = `bold ${fsz}px "${tok.red ? 'Inter-B' : 'Inter-SB'}"`
          let partW = ctx.measureText(part).width

          // 1. Blokir spasi awal baris biar teks gak miring ke kanan
          if (/^\s+$/.test(part) && curLine.length === 0) {
            continue
          }

          // 2. Kalau panjang teks melebihi Safe Zone
          if (curLine.length > 0 && curW + partW > maxWidth) {
            // Bersihkan sisa spasi di akhir baris sebelum pindah
            while (curLine.length > 0 && /^\s+$/.test(curLine[curLine.length - 1].text)) {
              let popped = curLine.pop()
              ctx.font = `bold ${fsz}px "${popped.red ? 'Inter-B' : 'Inter-SB'}"`
              curW -= ctx.measureText(popped.text).width
            }
            
            if (curLine.length > 0) lines.push(curLine)

            curLine = []
            curW = 0

            // Jangan biarkan baris baru diawali spasi
            if (/^\s+$/.test(part)) continue

            curLine.push({ text: part, red: tok.red })
            curW += partW
          } else {
            // 3. Gabungkan teks ke baris
            curLine.push({ text: part, red: tok.red })
            curW += partW
          }
        }
      }

      // Simpan potongan sisa di paragraf
      if (curLine.length > 0) {
        while (curLine.length > 0 && /^\s+$/.test(curLine[curLine.length - 1].text)) {
          let popped = curLine.pop()
          ctx.font = `bold ${fsz}px "${popped.red ? 'Inter-B' : 'Inter-SB'}"`
          curW -= ctx.measureText(popped.text).width
        }
        if (curLine.length > 0) lines.push(curLine)
      }
    }
    return lines
  }

  function getLineWidth(ctx, segments, fsz) {
    let w = 0
    for (let seg of segments) {
      ctx.font = `bold ${fsz}px "${seg.red ? 'Inter-B' : 'Inter-SB'}"`
      w += ctx.measureText(seg.text).width
    }
    return w
  }

  function drawScaledText(ctx, input) {
    const MAX_FONT = 65
    const MIN_FONT = 18
    let fsz = MAX_FONT
    let lines, totalH, lh

    // Auto-scale
    do {
      lh = fsz * 1.3
      lines = buildLines(ctx, input, safeW, fsz)
      totalH = lines.length * lh
      if (totalH <= safeH) break
      fsz -= 1
    } while (fsz > MIN_FONT)

    // Fallback limit baris
    if (totalH > safeH) {
      const maxLines = Math.floor(safeH / lh)
      lines = lines.slice(0, maxLines)
      if (lines.length > 0) {
        let lastLine = lines[lines.length - 1]
        if(lastLine && lastLine.length > 0) {
            ctx.font = `bold ${fsz}px "Inter-SB"`
            let dotsW = ctx.measureText('...').width
            while (getLineWidth(ctx, lastLine, fsz) + dotsW > safeW) {
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
      }
      totalH = lines.length * lh
    }

    let startY = safeCY - totalH / 2 + lh / 2
    ctx.textBaseline = 'middle'

    // Render rata tengah (Center)
    for (let i = 0; i < lines.length; i++) {
      let segments = lines[i]
      
      if (!segments || segments.length === 0) continue

      let totalW = getLineWidth(ctx, segments, fsz)
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
  
  // @napi-rs/canvas: toBuffer pakai encode('png')
  return await canvas.encode('png')
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const input = args.join(' ') || "Tes render teks"
  const testPP = 'https://raw.githubusercontent.com/uploader762/dat4/main/uploads/e0f993-1777126212302.jpg'
  generate(testPP, 'Someone', input).then(buffer => {
    fs.writeFileSync('./test_result.png', buffer)
  })
}

export default { help: ['igstory'], command: ['igstory'], tags: ['maker'], run: generate }

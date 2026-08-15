// paper-review — host half.
// Converts uploaded PDFs to structured selectable HTML and Markdown via
// poppler, serves everything over same-origin routes, materializes papers as
// project folders under a "Paper" workspace, and keeps one paper store per
// linked session so each project's viewer shows its own paper.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import os from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MAX_BYTES = 30 * 1024 * 1024
const TOOL_TIMEOUT = 180000

function paperDir() {
  const home = process.env.DSH_HOME || join(os.homedir(), '.dsh')
  return join(home, 'paper-review')
}

function decodeName(value) {
  if (typeof value !== 'string' || value === '') return null
  try { return decodeURIComponent(value).slice(0, 200) } catch (error) { return String(value).slice(0, 200) }
}

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xmlUnescape(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
}

function median(arr) {
  if (arr.length === 0) return 0
  const s = arr.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function isTableRowLine(l) {
  if (l.words.length < 3) return false
  const words = l.words.slice().sort((a, b) => a.x - b.x)
  const gaps = []
  for (let i = 1; i < words.length; i++) gaps.push(words[i].x - words[i - 1].x2)
  const smallest = Math.min.apply(null, gaps)
  const threshold = Math.max(12, Math.min(24, smallest * 3))
  const big = gaps.filter((g) => g >= threshold)
  // 2-column rows (Parameter | Value) show a single large gap; 3+ column
  // rows show at least two.
  if (big.length >= 2) return true
  return big.length >= 1 && big[0] >= 25 && words.length >= 4
}

function detectColumns(run) {
  const minShare = Math.max(2, Math.ceil(run.length * 0.6))
  const votes = new Map()
  run.forEach((l) => {
    const seen = new Set()
    l.words.forEach((w) => {
      const key = Math.round(w.x / 3)
      if (!seen.has(key)) { votes.set(key, (votes.get(key) || 0) + 1); seen.add(key) }
    })
  })
  const cols = [...votes.entries()].filter((e) => e[1] >= minShare).map((e) => e[0] * 3).sort((a, b) => a - b)
  if (cols.length < 2 || cols.length > 12) return []
  for (let i = 1; i < cols.length; i++) if (cols[i] - cols[i - 1] < 12) return []
  return cols
}

function renderSegments(segs) {
  let out = ''
  for (const s of segs) {
    const t = htmlEscape(s.t)
    const html = s.kind === 'sub' ? '<sub>' + t + '</sub>' : s.kind === 'sup' ? '<sup>' + t + '</sup>' : t
    if (out !== '' && s.kind === 'n') out += ' '
    out += html
  }
  return out
}

function plainSegments(segs) {
  let out = ''
  for (const s of segs) {
    if (out !== '' && s.kind === 'n') out += ' '
    out += s.t
  }
  return out
}

function completeLine(l) {
  l.words.sort((a, b) => a.x - b.x)
  l.x = Math.min.apply(null, l.words.map((w) => w.x))
  const baseH = median(l.heights)
  // Caps-only text has no descenders, so its bbox height understates the
  // font size (≈0.72em vs ≈0.95em); normalize it for size comparisons.
  const hasLower = l.words.some((w) => /[a-z]/.test(w.t))
  l.hbody = hasLower ? baseH : baseH * 1.3
  const normals = l.words.filter((w) => (w.y2 - w.y) >= baseH * 0.85)
  const refCy = normals.length > 0
    ? median(normals.map((w) => (w.y + w.y2) / 2))
    : l.cy
  const segs = []
  l.words.forEach((w, idx) => {
    const h = w.y2 - w.y
    const cy = (w.y + w.y2) / 2
    let kind = 'n'
    if (h < baseH * 0.8) {
      const prev = l.words[idx - 1]
      const next = l.words[idx + 1]
      const nearPrev = !!prev && (w.x - prev.x2) < baseH * 0.9
      const nearNext = !!next && (next.x - w.x2) < baseH * 0.9
      if (nearPrev || nearNext) {
        if (cy > refCy + baseH * 0.15) kind = 'sub'
        else if (cy < refCy - baseH * 0.15) kind = 'sup'
      }
    }
    const parts = w.t.split(/\s+/).filter((p) => p.length > 0)
    for (const part of parts) {
      const isDots = /^[.\u22C5\u2026]+$/.test(part)
      const last = segs.length > 0 ? segs[segs.length - 1] : null
      if (isDots && last && last.dots) {
        last.t += part
        continue
      }
      segs.push({ t: part, x: w.x, kind, dots: isDots })
    }
  })
  l.segments = segs
  l.html = renderSegments(segs)
  l.plain = plainSegments(segs)
  return l
}

function makeSplitLine(words) {
  return completeLine({
    words,
    heights: words.map((w) => w.y2 - w.y),
    cy: median(words.map((w) => (w.y + w.y2) / 2)),
    h: Math.max.apply(null, words.map((w) => w.y2 - w.y)),
  })
}

function rowCells(line, cols) {
  return cols.map((c) => {
    const segs = (line.segments || []).filter((s) => Math.abs(s.x - c) <= 6)
    return { h: segs.length > 0 ? renderSegments(segs) : '', p: segs.length > 0 ? plainSegments(segs) : '' }
  })
}

function renderBlock(b) {
  if (b.type === 'h') return '<h' + b.level + '>' + b.html + '</h' + b.level + '>'
  if (b.type === 'p') return '<p>' + b.html + '</p>'
  if (b.type === 'toc') {
    return '<div class="pp-toc"><span class="pp-toc-entry">' + b.entry + '</span><span class="pp-toc-page">' + b.page + '</span></div>'
  }
  if (b.type === 'math') {
    return '<div class="pp-math">' + b.html + '</div>'
  }
  if (b.type === 'table') {
    const head = b.rows.length > 0
      ? '<tr>' + b.rows[0].map((c) => '<th>' + c.h + '</th>').join('') + '</tr>'
      : ''
    const bodyRows = b.rows.slice(1)
      .map((r) => '<tr>' + r.map((c) => '<td>' + c.h + '</td>').join('') + '</tr>')
      .join('')
    return '<table>' + head + bodyRows + '</table>'
  }
  if (b.type === 'figure') {
    return '<figure><img src="/paper-review/fig/' + encodeURIComponent(b.file) + '" alt="Figure ' + b.n + ' (page ' + b.page + ')"/><figcaption>Figure ' + b.n + ' \u2014 page ' + b.page + '</figcaption></figure>'
  }
  if (b.type === 'figureimg') {
    return '<figure class="pp-figcrop"><img src="/paper-review/fig/' + encodeURIComponent(b.file) + '" alt="Figure" style="width:' + Math.round(b.w) + 'pt"/></figure>'
  }
  if (b.type === 'eqimg') {
    return '<div class="pp-eq"><img src="/paper-review/fig/' + encodeURIComponent(b.file) + '" alt="' + htmlEscape(b.plain) + '" style="width:' + Math.round(b.w) + 'pt"/><span class="pp-eq-sr">' + htmlEscape(b.plain) + '</span></div>'
  }
  return ''
}

function renderMdBlock(b) {
  if (b.type === 'h') return '#'.repeat(Math.min(b.level, 6)) + ' ' + b.plain
  if (b.type === 'p') return b.plain
  if (b.type === 'toc') return '- ' + b.entryPlain + ' — page ' + b.pagePlain
  if (b.type === 'math') return b.plain
  if (b.type === 'table') {
    const rows = b.rows.map((r) => '| ' + r.map((c) => c.p).join(' | ') + ' |')
    return rows.join('\n')
  }
  if (b.type === 'figure') return '![Figure ' + b.n + ' (page ' + b.page + ')](figs/' + encodeURIComponent(b.file) + ')'
  if (b.type === 'figureimg') return '![Figure](figs/' + encodeURIComponent(b.file) + ')'
  if (b.type === 'eqimg') return '(equation rendered as an image)'
  return ''
}

async function convertPdf(pdfPath, dir) {
  const bboxPath = join(dir, 'bbox.xml')
  const figPrefix = join(dir, 'fig')
  const pagesDir = join(dir, 'pages')
  try { rmSync(pagesDir, { recursive: true, force: true }) } catch (error) {}
  // Page crops are regenerated on every conversion, so stale ones from an
  // earlier run of the same PDF must not linger.
  try {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('crop-') && f.endsWith('.png')) unlinkSync(join(dir, f))
    }
  } catch (error) {}
  await run('pdftotext', ['-bbox', '-enc', 'UTF-8', pdfPath, bboxPath], { timeout: TOOL_TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
  const bboxXml = readFileSync(bboxPath, 'utf8')

  const pages = []
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
  let total = 0
  let pm
  while ((pm = pageRe.exec(bboxXml)) !== null) {
    const words = []
    const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g
    let wm
    while ((wm = wordRe.exec(pm[3])) !== null) {
      // Drop rotated/multi-line artifacts (plot axis labels, margin dates,
      // watermarks): their bounding boxes are tens to hundreds of points tall
      // or wide, and they poison the line-height heuristics. Rotated text is
      // taller than it is wide; real words are wider than tall.
      const hRaw = +wm[4] - +wm[2]
      const wRaw = +wm[3] - +wm[1]
      if (hRaw > 35 || wRaw > 250) continue
      if (hRaw >= 15 && hRaw > wRaw * 1.1) continue
      words.push({ x: +wm[1], y: +wm[2], x2: +wm[3], y2: +wm[4], t: xmlUnescape(wm[5]) })
    }
    total += words.length
    pages.push({ width: +pm[1], height: +pm[2], words })
  }

  if (total === 0) {
    mkdirSync(pagesDir, { recursive: true })
    await run('pdftoppm', ['-png', '-r', '150', pdfPath, join(pagesDir, 'page')], { timeout: TOOL_TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
    const files = readdirSync(pagesDir).filter((f) => /^page-.*\.png$/.test(f)).sort()
    const parts = []
    for (let i = 0; i < files.length; i++) {
      parts.push('<div class="pp-pageimg-wrap"><img class="pp-pageimg" src="/paper-review/pages/' + encodeURIComponent(files[i]) + '" alt="Page ' + (i + 1) + '"/></div>')
    }
    return { fallback: true, pages: files.length, html: parts.join('\n'), md: '', title: null, abstract: null }
  }

  // Raster figures. `pdfimages -list` reports every raster object in the
  // PDF, and each image with an alpha channel appears TWICE: an `image`
  // row plus its `smask` companion. A smask is not content — rendered
  // alone it is a blank gray rectangle. A pixel-size threshold is
  // meaningless on its own (resolution varies per object), so classify by
  // PHYSICAL size in points: a content figure is at least MIN_FIGURE_PT on
  // both axes, while inline icons and badges (e.g. ORCID logos at ~9 pt)
  // fall far below. Output files are numbered by the `num` column, so map
  // each surviving image to its file by number instead of trusting a
  // filtered list to stay aligned with the alphabetical file order.
  const MIN_FIGURE_PT = 40
  const images = []
  try {
    const { stdout } = await run('pdfimages', ['-list', pdfPath], { timeout: TOOL_TIMEOUT })
    for (const line of stdout.split('\n').slice(2)) {
      const p = line.trim().split(/\s+/)
      if (p.length < 15 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1]) || p[2] !== 'image') continue
      const ppi = +p[12] || 0
      const ptW = ppi > 0 ? (+p[3] / ppi) * 72 : 0
      const ptH = ppi > 0 ? (+p[4] / ppi) * 72 : 0
      if (ptW >= MIN_FIGURE_PT && ptH >= MIN_FIGURE_PT) images.push({ num: +p[1], page: +p[0], w: +p[3] || 0, h: +p[4] || 0 })
    }
  } catch (error) {}
  if (images.length > 0) {
    try {
      await run('pdfimages', ['-png', pdfPath, figPrefix], { timeout: TOOL_TIMEOUT })
    } catch (error) {}
  }
  images.forEach((img) => {
    const file = 'fig-' + String(img.num).padStart(3, '0') + '.png'
    img.file = existsSync(join(dir, file)) ? file : null
  })
  // Drop extracted files that no surviving figure references (smask
  // companions, sub-figure-size icons, leftovers from earlier runs).
  const usedFigFiles = new Set(images.map((im) => im.file).filter(Boolean))
  try {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('fig-') && f.endsWith('.png') && !usedFigFiles.has(f)) unlinkSync(join(dir, f))
    }
  } catch (error) {}

  const bodyHeights = []

  // Cluster words into lines by y-proximity (within one column).
  function clusterWords(words) {
    const sorted = words.slice().sort((a, b) => a.y - b.y || a.x - b.x)
    const lines = []
    let cur = null
    for (const w of sorted) {
      const h = w.y2 - w.y
      const cy = (w.y + w.y2) / 2
      if (cur && Math.abs(cy - cur.cy) <= Math.max(3, cur.h * 0.6)) {
        cur.words.push(w)
        cur.heights.push(h)
        cur.h = Math.max(cur.h, h)
        cur.cy = (cur.cy * (cur.words.length - 1) + cy) / cur.words.length
      } else {
        cur = { cy, h, heights: [h], words: [w] }
        lines.push(cur)
      }
    }
    return lines
  }

  // Two-column pages interleave both columns' words in the content stream.
  // The column gutter is the x where (almost) no word straddles. A gutter is
  // trusted only when it repeats at the same x across the majority of pages
  // (tables in single-column papers create spurious one-page valleys).
  function pageSplits(pages) {
    const valleys = pages.map((page) => {
      const words = page.words.filter((w) => w.y > page.height * 0.18)
      if (words.length < 30) return null
      let best = null
      for (let x = Math.floor(page.width * 0.22); x <= Math.floor(page.width * 0.78); x += 6) {
        let strad = 0
        for (const w of words) if (w.x < x && w.x2 > x) strad++
        if (best === null || strad < best.strad) best = { strad, x }
      }
      return best && best.strad <= Math.max(6, words.length * 0.02) ? best : null
    })
    const clusters = new Map()
    valleys.forEach((v) => {
      if (!v) return
      let key = null
      for (const k of clusters.keys()) if (Math.abs(k - v.x) <= 12) { key = k; break }
      if (key === null) { key = v.x; clusters.set(key, []) }
      clusters.get(key).push(v.x)
    })
    let majority = null
    for (const [k, arr] of clusters) {
      if (!majority || arr.length > majority.arr.length) majority = { k, arr }
    }
    const strong = majority && majority.arr.length >= Math.max(2, Math.ceil(pages.length * 0.5))
    if (!strong) return valleys.map(() => null)
    // Apply the majority gutter to every page: full-width lines (titles,
    // spanning tables) split at the gutter and are re-merged afterwards, so
    // irregular pages survive; pages whose own valley disagrees keep none.
    return valleys.map((v) => (v === null || Math.abs(v.x - majority.k) <= 24 ? majority.k : null))
  }

  // Merge same-y, x-adjacent line pairs (left + right column fragments of a
  // full-width line such as a title or a spanning table row).
  function mergeSpanning(linesA, linesB) {
    const out = []
    const used = new Set()
    linesA.forEach((a) => {
      const aW = Math.max.apply(null, a.words.map((w) => w.x2)) - Math.min.apply(null, a.words.map((w) => w.x))
      let match = null
      linesB.forEach((b, bi) => {
        if (used.has(bi)) return
        if (Math.abs(b.cy - a.cy) <= 4) {
          const bX = Math.min.apply(null, b.words.map((w) => w.x))
          const gap = bX - (Math.min.apply(null, a.words.map((w) => w.x)) + aW)
          if (gap <= 8) { match = { b, bi }; return }
        }
      })
      if (match) {
        used.add(match.bi)
        out.push({
          cy: (a.cy * a.words.length + match.b.cy * match.b.words.length) / (a.words.length + match.b.words.length),
          h: Math.max(a.h, match.b.h),
          heights: a.heights.concat(match.b.heights),
          words: a.words.concat(match.b.words),
          col: 'A',
        })
      } else {
        out.push({ ...a, col: 'A' })
      }
    })
    linesB.forEach((b, bi) => {
      if (!used.has(bi)) out.push({ ...b, col: 'B' })
    })
    return out
  }

  const splits = pageSplits(pages)
  pages.forEach((page, pi) => {
    const split = splits[pi]
    let lines
    if (split !== null) {
      const colA = page.words.filter((w) => (w.x + w.x2) / 2 < split)
      const colB = page.words.filter((w) => (w.x + w.x2) / 2 >= split)
      lines = mergeSpanning(clusterWords(colA), clusterWords(colB))
    } else {
      lines = clusterWords(page.words)
    }
    lines.forEach(completeLine)
    if (split === null) {
      lines.sort((a, b) => a.cy - b.cy)
      lines.forEach((l) => { l.col = '' })
    }
    page.lines = lines
    lines.forEach((l) => bodyHeights.push(l.baseH))
  })
  // Body font size: the MODE of line heights (the most common line height is
  // body text; tables and headings cannot skew it the way a median can).
  let body = 12
  {
    const buckets = new Map()
    for (const h of bodyHeights) {
      const k = Math.round(h)
      buckets.set(k, (buckets.get(k) || 0) + 1)
    }
    let bestCount = 0
    for (const [k, c] of buckets) {
      if (c > bestCount) { bestCount = c; body = k }
    }
  }

  // ── figure regions and display equations, rendered as page crops ──────────
  // Vector-drawn figures and LaTeX display equations have no raster images to
  // extract; instead, locate their bounding boxes from the text layout and
  // rasterize them with pdftoppm.
  const MATH_RE = /[=\u2190-\u21FF\u2200-\u2216\u2218-\u22FF\u27C0-\u27FF\u0370-\u03FF\u{1D400}-\u{1D7FF}]/gu
  function mathyCount(s) {
    const m = String(s).match(MATH_RE)
    return m ? m.length : 0
  }
  function isEqLine(l) {
    // Display equations are SHORT math-dense lines; long prose lines with a
    // small inline equation must stay selectable text.
    if (l.plain.length > 90 || l.words.length > 10) return false
    const mathy = mathyCount(l.plain)
    return mathy >= 3 || (mathy >= 1 && /[=:]/.test(l.plain))
  }

  async function cropPageRegions(pdfPath, pageNum, rects, outDir) {
    const files = []
    for (let n = 0; n < rects.length; n++) {
      const r = rects[n]
      const scale = 150 / 72
      const x = Math.max(0, Math.floor(r.left * scale))
      const y = Math.max(0, Math.floor(r.top * scale))
      const w = Math.max(8, Math.ceil((r.right - r.left) * scale))
      const h = Math.max(8, Math.ceil((r.bottom - r.top) * scale))
      const name = 'crop-' + pageNum + '-' + n
      try {
        await run('pdftoppm', ['-f', String(pageNum), '-l', String(pageNum), '-r', '150', '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h), '-png', '-singlefile', pdfPath, join(outDir, name)], { timeout: TOOL_TIMEOUT })
        const file = name + '.png'
        files.push(existsSync(join(outDir, file)) ? file : null)
      } catch (error) {
        files.push(null)
      }
    }
    return files
  }

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    // Column left margin: the MEDIAN line start (margin headers at x≈20
    // would skew the minimum and make everything look "indented").
    const colMin = {}
    const starts = {}
    page.lines.forEach((l) => {
      const t = l.col || ''
      if (!starts[t]) starts[t] = []
      starts[t].push(l.x)
    })
    for (const t of Object.keys(starts)) {
      colMin[t] = median(starts[t])
    }
    // Figure regions: runs bounded by two large vertical gaps in one column.
    const groups = {}
    page.lines.forEach((l) => {
      const t = l.col || ''
      if (!groups[t]) groups[t] = []
      groups[t].push(l)
    })
    const rects = []
    const figMarkers = []
    for (const t of Object.keys(groups)) {
      const ls = groups[t]
      const gapOf = (a, b) => b.cy - a.cy - (a.h + b.h) / 2
      // Split the column into blocks at large vertical gaps (column edges
      // included), then classify each block by TEXT DENSITY: figures are
      // mostly-empty regions with sparse labels, while paragraphs, title
      // blocks, and tables are dense. One principled measure replaces the
      // old per-paper label heuristics.
      const spans = []
      let start = 0
      for (let k = 0; k < ls.length - 1; k++) {
        if (gapOf(ls[k], ls[k + 1]) >= 30) {
          spans.push({ from: start, to: k })
          start = k + 1
        }
      }
      spans.push({ from: start, to: ls.length - 1 })
      const blocks = spans.map((b) => {
        let wordArea = 0
        let minX = Infinity
        let maxX = -Infinity
        for (let k = b.from; k <= b.to; k++) {
          for (const w of ls[k].words) {
            wordArea += Math.max(0.5, w.x2 - w.x) * Math.max(0.5, w.y2 - w.y)
            if (w.x < minX) minX = w.x
            if (w.x2 > maxX) maxX = w.x2
          }
        }
        const top = ls[b.from].cy - ls[b.from].h / 2
        const bottom = ls[b.to].cy + ls[b.to].h / 2
        const h = bottom - top
        const w = Math.max(30, maxX - minX)
        return { ...b, top, bottom, h, minX, maxX, density: h > 0 ? wordArea / (h * w) : 1 }
      }).filter((b) => b.to >= b.from && b.h >= 8)
      // A figure = a maximal run of consecutive sparse blocks.
      let runStart = 0
      while (runStart < blocks.length) {
        if (blocks[runStart].density >= 0.12) { runStart++; continue }
        let runEnd = runStart
        while (runEnd + 1 < blocks.length && blocks[runEnd + 1].density < 0.12) runEnd++
        const top = blocks[runStart].top
        const bottom = blocks[runEnd].bottom
        const h = bottom - top
        const lineCount = blocks.slice(runStart, runEnd + 1).reduce((s, b) => s + (b.to - b.from + 1), 0)
        if (h >= 50 && h <= 640 && (runEnd > runStart || lineCount >= 3)) {
          let minX = Infinity
          let maxX = -Infinity
          for (let b = runStart; b <= runEnd; b++) {
            if (blocks[b].minX < minX) minX = blocks[b].minX
            if (blocks[b].maxX > maxX) maxX = blocks[b].maxX
          }
          let left = Math.max(0, minX - 8)
          let right = Math.min(page.width, maxX + 8)
          if (t === 'A') right = Math.min(right, page.width * 0.5 + 6)
          if (t === 'B') left = Math.max(left, page.width * 0.5 - 6)
          const region = { top, bottom, left, right, file: null }
          for (let b = runStart; b <= runEnd; b++) {
            for (let k = blocks[b].from; k <= blocks[b].to; k++) ls[k].inFig = region
          }
          rects.push(region)
          figMarkers.push(region)
        }
        runStart = runEnd + 1
      }
    }
    // Display equations: indented, math-dense lines, grouped when consecutive.
    const eqGroups = []
    for (const t of Object.keys(groups)) {
      const ls = groups[t]
      let i = 0
      while (i < ls.length) {
        const l = ls[i]
        const indented = (l.x - (colMin[t] || l.x)) >= 25
        const headingLike = l.hbody >= body * 1.25
        if (!l.inFig && indented && isEqLine(l) && !headingLike) {
          const grp = [l]
          let j = i + 1
          while (j < ls.length && !ls[j].inFig) {
            const m = ls[j]
            const ind2 = (m.x - (colMin[t] || m.x)) >= 25
            if (!ind2 || !isEqLine(m) || m.hbody >= body * 1.25) break
            const gap = m.cy - ls[j - 1].cy - (ls[j - 1].h + m.h) / 2
            if (gap > body * 1.1) break
            grp.push(m)
            j++
          }
          const left = Math.max(0, Math.min.apply(null, grp.map((x) => x.x)) - 6)
          const right = Math.min(page.width, Math.max.apply(null, grp.map((x) => Math.max.apply(null, x.words.map((w) => w.x2)))) + 6)
          const top = grp[0].cy - grp[0].h / 2 - 4
          const bottom = grp[grp.length - 1].cy + grp[grp.length - 1].h / 2 + 4
          const group = { top, bottom, left, right, file: null, lines: grp, plain: grp.map((x) => x.plain).join(' ') }
          grp.forEach((x) => { x.eqGroup = group })
          rects.push(group)
          eqGroups.push(group)
          i = j
          continue
        }
        i++
      }
    }
    if (rects.length > 0) {
      const files = await cropPageRegions(pdfPath, pi + 1, rects, dir)
      rects.forEach((r, idx) => { r.file = files[idx] })
    }
    page.figRegions = figMarkers
    page.eqGroups = eqGroups
  }

  const parts = []
  const mdParts = []
  let firstHeading = null
  let abstractText = null
  let pendingAbstract = false

  pages.forEach((page, pi) => {
    const CAPS_RE = /^[A-Z][A-Z0-9\u00C0-\u024F\s.,:;\-–—]{4,}$/
    const splitLines = []
    for (const l of page.lines) {
      const firstWord = l.words.length > 0 ? l.words[0] : null
      const firstH = firstWord ? (firstWord.y2 - firstWord.y) : 0
      const capsHeading = !!firstWord && CAPS_RE.test(firstWord.t)
      if (l.words.length > 1 && (firstH >= body * 1.25 || capsHeading)) {
        let k = 1
        if (firstH >= body * 1.25) {
          while (k < l.words.length && (l.words[k].y2 - l.words[k].y) >= body * 1.12) k++
        }
        if (k < l.words.length && k <= 6) {
          const headLine = makeSplitLine(l.words.slice(0, k))
          headLine.forceHeading = true
          splitLines.push(headLine)
          splitLines.push(makeSplitLine(l.words.slice(k)))
          continue
        }
      }
      if (l.words.length === 1 && capsHeading) l.forceHeading = true
      splitLines.push(l)
    }
    const lines = splitLines
    const blocks = []
    let para = null
    const flushPara = () => {
      if (para) {
        blocks.push({ type: 'p', html: para.map((x) => x.html).join(' '), plain: para.map((x) => x.plain).join(' ') })
        para = null
      }
    }
    const isMathLine = (line) => line.words.length <= 4
      && line.words.filter((w) => /[^\x00-\x7F]/.test(w.t)).length >= Math.ceil(line.words.length * 0.6)
    let i = 0
    let lastFig = null
    const emittedFigs = new Set()
    while (i < lines.length) {
      const l = lines[i]
      // Lines inside a figure region are swallowed: the figure renders as an
      // image; internal labels are dropped from the text flow.
      if (l.inFig) {
        if (l.inFig !== lastFig) {
          flushPara()
          if (l.inFig.file && !emittedFigs.has(l.inFig.file)) {
            blocks.push({ type: 'figureimg', file: l.inFig.file, w: l.inFig.right - l.inFig.left, h: l.inFig.bottom - l.inFig.top })
            emittedFigs.add(l.inFig.file)
          }
          lastFig = l.inFig
        }
        i++
        continue
      }
      lastFig = null
      let level = l.forceHeading ? 3 : l.hbody >= body * 1.55 ? 1 : l.hbody >= body * 1.32 ? 2 : l.hbody >= body * 1.2 ? 3 : 0
      // Single-word lines are headings only when they look like words:
      // annotations, page numbers, and watermarks (e.g. "28", "Jul") stay text.
      if (level > 0 && l.words.length === 1 && !l.forceHeading) {
        const t = l.plain
        if (t.length < 4 || !/[A-Za-z\u00C0-\u024F]{2,}/.test(t)) level = 0
      }
      if (level > 0) {
        flushPara()
        if (firstHeading === null) firstHeading = l.plain
        if (/^abstract$/i.test(l.plain.trim())) pendingAbstract = true
        blocks.push({ type: 'h', level, html: l.html, plain: l.plain })
        i++
        continue
      }
      const dotIdx = (l.segments || []).findIndex((s) => s.dots && s.t.length >= 6)
      const afterDots = dotIdx >= 0 ? l.segments.slice(dotIdx + 1) : []
      const pageText = afterDots.map((s) => s.t).join('').trim()
      if (dotIdx >= 0 && /^\d+$/.test(pageText) && afterDots.length >= 1) {
        flushPara()
        blocks.push({
          type: 'toc',
          entry: renderSegments(l.segments.slice(0, dotIdx + 1)),
          page: renderSegments(afterDots),
          entryPlain: plainSegments(l.segments.slice(0, dotIdx + 1)),
          pagePlain: plainSegments(afterDots),
        })
        i++
        continue
      }
      // Display equations render as cropped images (fractions, cases, and
      // alignment stay visually intact).
      if (l.eqGroup) {
        flushPara()
        const grp = l.eqGroup
        if (grp.file) {
          blocks.push({ type: 'eqimg', file: grp.file, w: grp.right - grp.left, h: grp.bottom - grp.top, plain: grp.plain })
        } else {
          blocks.push({ type: 'math', html: grp.lines.map((x) => x.html).join('<br/>'), plain: grp.plain })
        }
        i += grp.lines.length
        continue
      }
      if (isMathLine(l)) {
        const mathHtml = []
        const mathPlain = []
        let j = i
        while (j < lines.length && isMathLine(lines[j])) {
          mathHtml.push(lines[j].html)
          mathPlain.push(lines[j].plain)
          j++
        }
        flushPara()
        blocks.push({ type: 'math', html: mathHtml.join('<br/>'), plain: mathPlain.join(' ') })
        i = j
        continue
      }
      let j = i
      if (isTableRowLine(l)) {
        while (j < lines.length && isTableRowLine(lines[j])) j++
        const run = lines.slice(i, j)
        if (run.length >= 2) {
          let cols = detectColumns(run)
          if (cols.length >= 3) {
            // Absorb wrapped continuation lines: a line whose words all land
            // in the established columns (none at the first column's start)
            // belongs to the cell above it.
            let extended = false
            const rows = run.map((rl) => rowCells(rl, cols))
            let k = j
            while (k < lines.length) {
              const nxt = lines[k]
              const wordsInCols = nxt.words.filter((w) => cols.some((c) => Math.abs(w.x - c) <= 6)).length
              const atFirstCol = nxt.words.some((w) => Math.abs(w.x - cols[0]) <= 6)
              if (wordsInCols >= Math.max(1, Math.ceil(nxt.words.length * 0.6)) && !atFirstCol && k - j < 8) {
                const cells = rowCells(nxt, cols)
                rows[rows.length - 1] = rows[rows.length - 1].map((cell, ci) => (cell && cells[ci]) ? cell + ' ' + cells[ci] : cell)
                j = k + 1
                extended = true
                k++
                continue
              }
              break
            }
            flushPara()
            blocks.push({ type: 'table', rows })
            i = j
            continue
          }
        }
      }
      const prev = lines[i - 1]
      const gap = prev ? l.cy - prev.cy - (prev.h + l.h) / 2 : 0
      if (para && gap > body * 0.9) flushPara()
      para = para || []
      para.push(l)
      i++
    }
    flushPara()

    let imgIdx = 0
    images.filter((im) => im.page === pi + 1).forEach((im) => {
      if (im.file) {
        imgIdx++
        blocks.push({ type: 'figure', file: im.file, n: imgIdx, page: pi + 1, w: im.w, h: im.h })
      }
    })

    for (const b of blocks) {
      if (b.type === 'p' && pendingAbstract && abstractText === null) {
        abstractText = b.plain
        pendingAbstract = false
      }
      parts.push(renderBlock(b))
      mdParts.push(renderMdBlock(b))
    }
    if (pi < pages.length - 1) {
      parts.push('<div class="pp-pagebreak">\u2014 Page ' + (pi + 2) + ' \u2014</div>')
      mdParts.push('\n---\n')
    }
  })
  // Title: prefer the first detected heading, but fall back to the largest
  // line on the first page (AASTeX-style titles are not always heading-sized
  // relative to the body, and "ABSTRACT" should never become the title).
  let title = firstHeading
  const t0 = title ? title.trim().replace(/^[\d.\s]+/, '') : ''
  if (!title || /^(abstract|introduction|contents)$/i.test(t0) || t0.length < 15 || /:$/.test(t0)) {
    // Score the top-block lines by size AND length (a journal masthead like
    // "MNRAS" is big but short; the title is long). Then absorb adjacent
    // same-size lines for multi-line titles.
    let best = null
    for (const l of pages[0].lines) {
      if (l.cy < pages[0].height * 0.05 || l.cy > pages[0].height * 0.28) continue
      const p = l.plain.trim()
      if (p.length < 8 || !/[A-Za-z]{3,}/.test(p)) continue
      if (l.hbody < body * 0.95) continue
      const score = l.hbody * Math.min(1, p.length / 20)
      if (!best || score > best.score) best = { line: l, score, hbody: l.hbody }
    }
    if (best) {
      const lines = pages[0].lines
      const idx = lines.indexOf(best.line)
      const parts = []
      // absorb preceding same-size lines ("FLAGS" before "II: Constraining…")
      for (let k = idx - 1; k >= Math.max(0, idx - 2); k--) {
        const prv = lines[k]
        if (prv.cy < pages[0].height * 0.05) break
        if (prv.hbody < best.hbody * 0.95) break
        const pp = prv.plain.trim()
        if (pp.length < 1 || !/[A-Za-z]{2,}/.test(pp)) break
        parts.unshift(pp)
      }
      parts.push(best.line.plain.trim())
      for (let k = idx + 1; k < lines.length && k <= idx + 3; k++) {
        const nxt = lines[k]
        if (nxt.cy > pages[0].height * 0.28) break
        if (nxt.hbody < best.hbody * 0.8) break
        const np = nxt.plain.trim()
        if (np.length < 2 || !/[A-Za-z]{2,}/.test(np)) break
        parts.push(np)
      }
      title = parts.join(' ')
    } else {
      title = firstHeading || null
    }
  }
  return {
    fallback: false,
    pages: pages.length,
    html: parts.join('\n'),
    md: mdParts.join('\n\n'),
    title,
    abstract: abstractText,
  }
}

export const name = 'paper-review'
export const inject = ['webServer']

// Exported for the evaluation harness (scripts/eval.mjs) and future tooling.
export { convertPdf }

const CONVERT_VERSION = 33

function makeStore(dir, opts = {}) {
  return {
    dir,
    pdfName: opts.pdfName || 'current.pdf',
    metaName: opts.metaName || 'current.json',
    htmlName: opts.htmlName || 'current.html',
    mdName: opts.mdName || 'current.md',
    bytes: null,
    meta: { name: '', size: 0 },
    html: null,
    md: '',
    title: null,
    abstract: null,
    conv: { converting: false, ready: false, fallback: false, pages: 0, error: null },
    seq: 0,
  }
}

export function apply(ctx) {
  const globalDir = paperDir()
  mkdirSync(globalDir, { recursive: true })
  const global = makeStore(globalDir)
  const linksPath = join(globalDir, 'links.json')
  let links = {}
  try { links = JSON.parse(readFileSync(linksPath, 'utf8')) } catch (error) { links = {} }
  const linkedStores = new Map()

  function saveLinks() {
    try { writeFileSync(linksPath, JSON.stringify(links)) } catch (error) {}
  }

  function pdfPath(st) { return join(st.dir, st.pdfName) }
  function metaPath(st) { return join(st.dir, st.metaName) }
  function htmlPath(st) { return join(st.dir, st.htmlName) }
  function mdPath(st) { return join(st.dir, st.mdName) }

  function startConvert(st) {
    const v = ++st.seq
    st.conv = { converting: true, ready: false, fallback: false, pages: 0, error: null }
    convertPdf(pdfPath(st), st.dir).then((result) => {
      if (v !== st.seq) return
      st.html = result.html
      st.md = result.md
      st.title = result.title
      st.abstract = result.abstract
      st.conv = { converting: false, ready: true, fallback: result.fallback, pages: result.pages, error: null }
      try {
        writeFileSync(htmlPath(st), st.html)
        writeFileSync(mdPath(st), st.md)
        writeFileSync(metaPath(st), JSON.stringify({ ...st.meta, pages: result.pages, fallback: result.fallback, convertVersion: CONVERT_VERSION }))
      } catch (error) {}
    }).catch((error) => {
      if (v !== st.seq) return
      st.html = null
      st.md = ''
      st.conv = { converting: false, ready: false, fallback: false, pages: 0, error: String((error && error.message) || error) }
    })
  }

  function initStore(st) {
    try {
      if (existsSync(pdfPath(st))) {
        st.bytes = readFileSync(pdfPath(st))
        const saved = existsSync(metaPath(st)) ? JSON.parse(readFileSync(metaPath(st), 'utf8')) : null
        st.meta = { name: (saved && saved.name) || basename(pdfPath(st)), size: st.bytes.length }
        if (existsSync(htmlPath(st)) && saved && saved.convertVersion === CONVERT_VERSION) {
          st.html = readFileSync(htmlPath(st), 'utf8')
          if (existsSync(mdPath(st))) st.md = readFileSync(mdPath(st), 'utf8')
          const titleMatch = st.html.match(/<h[123]>([^<]*)<\/h[123]>/)
          st.title = titleMatch ? titleMatch[1] : null
          st.conv = { converting: false, ready: true, fallback: !!saved.fallback, pages: saved.pages || 0, error: null }
        } else {
          startConvert(st)
        }
      }
    } catch (error) {
      st.bytes = null
      st.meta = { name: '', size: 0 }
    }
  }

  initStore(global)

  function storeFor(url) {
    try {
      const sid = new URL(url, 'http://localhost').searchParams.get('sessionId')
      if (sid && links[sid]) {
        let st = linkedStores.get(sid)
        if (!st) {
          st = makeStore(links[sid], { pdfName: 'paper.pdf', metaName: 'meta.json', htmlName: 'paper.html', mdName: 'paper.md' })
          linkedStores.set(sid, st)
          initStore(st)
        }
        return st
      }
    } catch (error) {}
    return global
  }

  function sendJson(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(obj))
  }

  function serveImage(req, res, prefix, subdir) {
    const st = storeFor(req.url)
    const pathname = new URL(req.url, 'http://localhost').pathname
    const name = decodeURIComponent(pathname.slice(prefix.length))
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { res.writeHead(400); res.end('bad name'); return }
    let data = null
    try {
      data = readFileSync(join(st.dir, subdir, name))
    } catch (error) {
      // linked stores keep images in a figs/ subfolder
      if (subdir === '') {
        try { data = readFileSync(join(st.dir, 'figs', name)) } catch (error2) {}
      }
    }
    if (data === null) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length, 'Cache-Control': 'no-store' })
    res.end(data)
  }

  async function createProject() {
    if (global.bytes === null || global.html === null) throw new Error('No converted paper available.')
    let base = null
    let workspaceId = null
    const wsReg = ctx.get('workspaceRegistry')
    if (wsReg) {
      let paperWs = wsReg.list().find((w) => w.title === 'Paper' || /\/Paper\/?$/.test(w.path))
      if (!paperWs) {
        const existing = wsReg.list().find((w) => w.path && /\/Downloads\/?$/.test(w.path))
        const root = existing ? existing.path : join(os.homedir(), 'Downloads')
        const paperPath = join(root, 'Paper')
        mkdirSync(paperPath, { recursive: true })
        try {
          paperWs = await wsReg.create(paperPath, 'Paper')
        } catch (error) {
          base = paperPath
        }
      }
      if (paperWs) {
        base = paperWs.path
        workspaceId = paperWs.id
      }
    }
    if (base === null) base = join(os.homedir(), 'Downloads', 'Paper')
    const rawName = global.title && String(global.title).trim() ? String(global.title).trim() : String(global.meta.name || 'paper').replace(/\.pdf$/i, '')
    const safe = rawName
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'paper'
    const projectDir = join(base, safe)
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'paper.pdf'), global.bytes)
    writeFileSync(join(projectDir, 'paper.md'), global.md || '')
    if (global.html) {
      const html = global.html.replace(/\/paper-review\/fig\//g, 'figs/').replace(/\/paper-review\/pages\//g, 'pages/')
      writeFileSync(join(projectDir, 'paper.html'), html)
    }
    try {
      const figs = readdirSync(globalDir).filter((f) => (f.startsWith('fig-') || f.startsWith('crop-')) && f.endsWith('.png'))
      if (figs.length > 0) {
        mkdirSync(join(projectDir, 'figs'), { recursive: true })
        for (const f of figs) writeFileSync(join(projectDir, 'figs', f), readFileSync(join(globalDir, f)))
      }
      const pageDir = join(globalDir, 'pages')
      if (existsSync(pageDir)) {
        mkdirSync(join(projectDir, 'pages'), { recursive: true })
        for (const f of readdirSync(pageDir)) writeFileSync(join(projectDir, 'pages', f), readFileSync(join(pageDir, f)))
      }
    } catch (error) {}
    const title = global.title || safe
    const readme = [
      '# ' + title,
      '',
      'Source: `' + global.meta.name + '` (' + formatSize(global.meta.size) + ', ' + (global.conv.pages || 0) + ' pages)',
      '',
      global.abstract ? '## Abstract\n\n' + global.abstract : '',
      '',
      '## Files',
      '',
      '- `paper.pdf` — the original PDF',
      '- `paper.md` — the converted text (headings, tables, sub/superscripts)',
      '- `paper.html` — the converted document (open in a browser)',
      '',
      'Use this folder as the workspace context when asking questions about the paper.',
    ].join('\n')
    writeFileSync(join(projectDir, 'README.md'), readme)
    writeFileSync(join(projectDir, 'meta.json'), JSON.stringify({
      name: global.meta.name,
      size: global.meta.size,
      pages: global.conv.pages,
      fallback: global.conv.fallback,
      title: global.title,
      convertVersion: CONVERT_VERSION,
    }))
    return { path: projectDir, workspaceId }
  }

  ctx.effect(() => {
    const routes = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/paper.pdf',
        handler(req, res) {
          const st = storeFor(req.url)
          if (st.bytes === null) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no paper'); return }
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': st.bytes.length,
            'Cache-Control': 'no-store',
          })
          res.end(st.bytes)
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/state',
        handler(req, res) {
          const st = storeFor(req.url)
          sendJson(res, 200, {
            present: st.bytes !== null,
            name: st.meta.name,
            size: st.bytes ? st.bytes.length : 0,
            converting: st.conv.converting,
            ready: st.conv.ready,
            fallback: st.conv.fallback,
            pages: st.conv.pages,
            title: st.title,
            error: st.conv.error,
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/document.html',
        handler(req, res) {
          const st = storeFor(req.url)
          if (st.html === null) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no document'); return }
          let html = st.html
          // For linked sessions, figure URLs carry the session so images
          // resolve against that project's store (project files may also use
          // relative figs/ paths from the exported standalone copy).
          try {
            const sid = new URL(req.url, 'http://localhost').searchParams.get('sessionId')
            if (sid && links[sid]) {
              html = html.replace(/\/paper-review\/fig\/([A-Za-z0-9._-]+)/g, '/paper-review/fig/$1?sessionId=' + encodeURIComponent(sid))
              html = html.replace(/\/paper-review\/pages\/([A-Za-z0-9._-]+)/g, '/paper-review/pages/$1?sessionId=' + encodeURIComponent(sid))
              html = html.replace(/src="figs\/([A-Za-z0-9._-]+)"/g, 'src="/paper-review/fig/$1?sessionId=' + encodeURIComponent(sid) + '"')
              html = html.replace(/src="pages\/([A-Za-z0-9._-]+)"/g, 'src="/paper-review/pages/$1?sessionId=' + encodeURIComponent(sid) + '"')
            }
          } catch (error) {}
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(html)
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/document.md',
        handler(req, res) {
          const st = storeFor(req.url)
          if (st.bytes === null) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no document'); return }
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(st.md)
        },
      }),
      ctx.webServer.register({
        kind: 'prefixes',
        path: '/paper-review/fig',
        handler(req, res) { serveImage(req, res, '/paper-review/fig/', '') },
      }),
      ctx.webServer.register({
        kind: 'prefixes',
        path: '/paper-review/pages',
        handler(req, res) { serveImage(req, res, '/paper-review/pages/', 'pages') },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/project',
        handler(req, res) {
          if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
          createProject().then((result) => {
            sendJson(res, 200, { ok: true, path: result.path, workspaceId: result.workspaceId })
          }).catch((error) => {
            sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/link',
        handler(req, res) {
          if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
          const chunks = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
              if (typeof body.sessionId !== 'string' || typeof body.path !== 'string') {
                sendJson(res, 400, { ok: false, error: 'sessionId and path are required.' })
                return
              }
              if (!existsSync(join(body.path, 'paper.pdf'))) {
                sendJson(res, 400, { ok: false, error: 'project folder not found.' })
                return
              }
              links[body.sessionId] = body.path
              saveLinks()
              sendJson(res, 200, { ok: true })
            } catch (error) {
              sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
            }
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/session-title',
        handler(req, res) {
          if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
          const chunks = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
              const titleSvc = ctx.get('sessionTitle')
              const sessionsSvc = ctx.get('sessions')
              const session = sessionsSvc && typeof body.sessionId === 'string' ? sessionsSvc.get(body.sessionId) : undefined
              if (!session || !titleSvc) { sendJson(res, 200, { ok: false, error: 'session unavailable' }); return }
              titleSvc.rename(session, String(body.title || 'Paper').slice(0, 80))
              sendJson(res, 200, { ok: true })
            } catch (error) {
              sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
            }
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/upload',
        handler(req, res) {
          if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
          const name = decodeName(req.headers['x-paper-name'])
          const chunks = []
          let size = 0
          let overflow = false
          req.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_BYTES) { overflow = true; return }
            chunks.push(chunk)
          })
          req.on('end', () => {
            if (overflow) { sendJson(res, 413, { ok: false, error: 'This PDF is larger than the 30 MB limit.' }); return }
            const buf = Buffer.concat(chunks)
            if (buf.length < 4) { sendJson(res, 400, { ok: false, error: 'Empty upload.' }); return }
            global.bytes = buf
            global.meta = { name: name || 'paper.pdf', size: buf.length }
            global.html = null
            global.md = ''
            global.title = null
            global.abstract = null
            try { writeFileSync(pdfPath(global), buf) } catch (error) {}
            try { writeFileSync(metaPath(global), JSON.stringify(global.meta)) } catch (error) {}
            try { unlinkSync(htmlPath(global)) } catch (error) {}
            try { unlinkSync(mdPath(global)) } catch (error) {}
            sendJson(res, 200, { ok: true, name: global.meta.name, size: global.meta.size })
            startConvert(global)
          })
          req.on('error', () => {
            try { sendJson(res, 400, { ok: false, error: 'Upload interrupted.' }) } catch (error) {}
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/paper-review/delete',
        handler(req, res) {
          global.seq++
          global.bytes = null
          global.meta = { name: '', size: 0 }
          global.html = null
          global.md = ''
          global.title = null
          global.abstract = null
          global.conv = { converting: false, ready: false, fallback: false, pages: 0, error: null }
          try { unlinkSync(pdfPath(global)) } catch (error) {}
          try { unlinkSync(metaPath(global)) } catch (error) {}
          try { unlinkSync(htmlPath(global)) } catch (error) {}
          try { unlinkSync(mdPath(global)) } catch (error) {}
          try { unlinkSync(join(globalDir, 'bbox.xml')) } catch (error) {}
          try { rmSync(join(globalDir, 'pages'), { recursive: true, force: true }) } catch (error) {}
          try {
            for (const f of readdirSync(globalDir)) {
              if ((f.startsWith('fig-') || f.startsWith('crop-')) && f.endsWith('.png')) unlinkSync(join(globalDir, f))
            }
          } catch (error) {}
          sendJson(res, 200, { ok: true })
        },
      }),
    ]
    return () => {
      for (const dispose of routes) dispose()
    }
  })
}

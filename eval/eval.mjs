// Evaluation harness v2.
//
// The naive "fraction of reference tokens present" metric is blind to most
// of what makes a converted paper WRONG: column interleaving (order), a
// title buried inside a paragraph (structure), phantom or blank figures
// (content), and duplicated or hallucinated tokens (precision). This
// harness measures those failure modes explicitly against the arXiv HTML
// version of the same paper:
//
//   - recall / precision: multiset token overlap (catches missing AND
//     duplicated/phantom text)
//   - order score: sentence-level concordance — the fraction of matched
//     sentence pairs that keep the reference order (inversion counting)
//   - title / abstract / section fidelity: token Jaccard against the HTML
//   - figure audit: block count vs real captions, blank/small files,
//     byte-duplicate files
//   - structure: title + abstract blocks exist, page breaks line up, and
//     the document does not open with one giant paragraph
//
// Corpus: `IDS=2608.12457,2608.12458 node eval/eval.mjs` pins the papers;
// default is to scrape the astro-ph/new listing (PAPERS=N). PDFs are
// cached in CORPUS (default ./eval/run).
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { convertPdf } from '../lib/index.js'

const OUT = process.env.CORPUS || new URL('./run', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

function fetchUrl(url) {
  return execFileSync('curl', ['-sL', '--max-time', '60', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function idsFromEnv() {
  const env = process.env.IDS || ''
  const ids = env.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length > 0) return ids
  const listing = fetchUrl('https://arxiv.org/list/astro-ph/new')
  const found = [...listing.matchAll(/href="\/pdf\/(\d{4}\.\d{4,5})"/g)].map((m) => m[1])
  return [...new Set(found)].slice(0, Number(process.env.PAPERS || 10))
}

function stripHtml(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Figure blocks carry alt-text/embedding artifacts that a PDF conversion
    // legitimately renders as pixels; exclude them from the reference text.
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/@\w+\{[^}]*\}/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The arXiv HTML page embeds UI chrome (headers, "Report GitHub Issue",
// orcid links, LaTeX markup artifacts) around the article. Only the
// <article class="ltx_document"> region is paper content.
function articleText(html) {
  let s = html
  const start = s.indexOf('<article')
  const end = s.indexOf('</article>')
  if (start >= 0 && end > start) s = s.slice(start, end)
  else if (start >= 0) s = s.slice(start)
  return stripHtml(s)
}

function tokenize(s) {
  s = s.toLowerCase()
    .replace(/report github issue/g, ' ')
    .replace(/external links/g, ' ')
    .replace(/link cited by/g, ' ')
    .replace(/instructions for reporting errors/g, ' ')
    .replace(/item \d+/g, ' ')
    .replace(/download pdf/g, ' ')
  return s.split(/[^a-z0-9]+/).filter(Boolean)
}

function counts(tokens) {
  const m = new Map()
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1)
  return m
}

function multisetOverlap(a, b) {
  const ca = counts(a)
  const cb = counts(b)
  let inter = 0
  for (const [t, n] of ca) inter += Math.min(n, cb.get(t) || 0)
  return inter
}

function jaccard(a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = sa.size + sb.size - inter
  return union > 0 ? inter / union : 0
}

function sentences(s) {
  return s
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 30 && x.length <= 700)
}

function inversions(arr) {
  // count inversions of the sequence (O(n log n))
  let inv = 0
  function mergeSort(a) {
    if (a.length <= 1) return a
    const mid = a.length >> 1
    const left = mergeSort(a.slice(0, mid))
    const right = mergeSort(a.slice(mid))
    const out = []
    let i = 0
    let j = 0
    while (i < left.length && j < right.length) {
      if (left[i] <= right[j]) { out.push(left[i++]) } else { out.push(right[j++]); inv += left.length - i }
    }
    return out.concat(left.slice(i), right.slice(j))
  }
  mergeSort(arr)
  return inv
}

function extractRef(html) {
  const article = (() => {
    const start = html.indexOf('<article')
    const end = html.indexOf('</article>')
    return start >= 0 && end > start ? html.slice(start, end) : html
  })()
  const title = (article.match(/<h1[^>]*class="[^"]*ltx_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''
  const abs = (article.match(/<div[^>]*class="[^"]*ltx_abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || ''
  const heads = [...article.matchAll(/<h[23][^>]*class="[^"]*ltx_title[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => m[1])
  const figTags = (article.match(/ltx_tag ltx_tag_figure/g) || []).length
  const figCaps = (article.match(/<figcaption/g) || []).length
  return {
    title: stripHtml(title),
    abstract: stripHtml(abs),
    heads: heads.map((h) => stripHtml(h)).filter((h) => h.trim().length > 0),
    figCount: figTags || figCaps,
    text: articleText(article),
  }
}

function extractMine(html) {
  const titles = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => stripHtml(m[1])).filter((t) => t.trim().length > 0)
  const heads = [...html.matchAll(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/g)].map((m) => stripHtml(m[1])).filter((t) => t.trim().length > 0)
  const abstract = (html.match(/<p class="pp-abstract">([\s\S]*?)<\/p>/) || [])[1]
  const figures = (html.match(/<figure>/g) || []).length
  const figcrops = (html.match(/pp-figcrop/g) || []).length
  const blocks = html.split('\n').filter((b) => b.trim().length > 0)
  const firstBlock = blocks[0] || ''
  return {
    titles,
    heads,
    abstract: stripHtml(abstract || ''),
    figureBlocks: figures + figcrops,
    rasterFigures: figures,
    cropFigures: figcrops,
    metas: (html.match(/class="pp-meta"/g) || []).length,
    firstIsP: /^<p/.test(firstBlock),
    firstPLen: firstBlock.length,
    giantParas: blocks.filter((b) => /^<p/.test(b) && b.length > 4000).length,
  }
}

function auditFigureFiles(dir) {
  const files = readdirSync(dir).filter((f) => f.startsWith('fig-') && f.endsWith('.png'))
  const sizes = files.map((f) => statSync(join(dir, f)).size)
  const hashes = files.map((f) => createHash('sha1').update(readFileSync(join(dir, f))).digest('hex'))
  const dupes = hashes.filter((h, i) => hashes.indexOf(h) !== i).length
  const small = files.filter((f, i) => sizes[i] < 20000)
  return {
    count: files.length,
    minBytes: sizes.length ? Math.min(...sizes) : 0,
    medianBytes: sizes.length ? sizes.slice().sort((a, b) => a - b)[Math.floor(sizes.length / 2)] : 0,
    duplicates: dupes,
    suspiciousSmall: small,
  }
}

const ids = idsFromEnv()
console.log('papers:', ids)
const results = []
let hardFails = 0

for (const id of ids) {
  const rec = { id }
  try {
    const html = fetchUrl(`https://arxiv.org/html/${id}v1`)
    if (!html.includes('<article') && !html.includes('ltx_abstract')) throw new Error('no html')
    const ref = extractRef(html)
    // The arXiv abs page <title> is the authoritative title; the HTML h1 is
    // sometimes an abbreviated version.
    let refTitle = ref.title
    try {
      const absPage = fetchUrl(`https://arxiv.org/abs/${id}`)
      const m = absPage.match(/<title>([\s\S]*?)<\/title>/)
      if (m) refTitle = stripHtml(m[1].replace(/^\[\d{4}\.\d{4,5}\]\s*/, ''))
    } catch (e) {}
    const refTitleForScore = refTitle || ref.title
    const pdfPath = join(OUT, `${id}.pdf`)
    if (!existsSync(pdfPath)) {
      execFileSync('curl', ['-sL', '--max-time', '120', '-o', pdfPath, `https://arxiv.org/pdf/${id}v1`])
    }
    const dir = join(OUT, id)
    mkdirSync(dir, { recursive: true })
    const r = await convertPdf(pdfPath, dir)
    const mine = extractMine(r.html)
    writeFileSync(join(dir, 'mine.txt'), stripHtml(r.html))
    writeFileSync(join(dir, 'ref.txt'), ref.text)

    // text metrics (multiset)
    const rT = tokenize(ref.text)
    const mT = tokenize(stripHtml(r.html))
    const inter = multisetOverlap(rT, mT)
    rec.recall = rT.length ? inter / rT.length : 0
    rec.precision = mT.length ? inter / mT.length : 0

    // order metric: sentence concordance
    const rS = sentences(ref.text)
    const mS = sentences(stripHtml(r.html))
    const mTok = mS.map(tokenize)
    const index = new Map()
    mTok.forEach((ts, i) => { for (const t of ts) { if (!index.has(t)) index.set(t, []); index.get(t).push(i) } })
    const pos = []
    const missingSample = []
    for (const rs of rS) {
      const rt = tokenize(rs)
      const cand = new Map()
      for (const t of rt) {
        for (const j of index.get(t) || []) cand.set(j, (cand.get(j) || 0) + 1)
      }
      let best = -1
      let bestJ = 0
      for (const [j, shared] of cand) {
        if (shared < 4) continue
        const jc = jaccard(rt, mTok[j])
        if (jc > bestJ) { bestJ = jc; best = j }
      }
      if (best >= 0 && bestJ >= 0.55) pos.push(best)
      else if (missingSample.length < 5) missingSample.push(rs.slice(0, 90))
    }
    rec.matchedSentences = pos.length
    rec.matchRate = rS.length ? pos.length / rS.length : 0
    const n = pos.length
    rec.orderScore = n > 1 ? 1 - inversions(pos) / (n * (n - 1) / 2) : 1

    // structure fidelity
    rec.title = r.title
    rec.titleScore = refTitleForScore && r.title ? jaccard(tokenize(String(refTitleForScore)), tokenize(String(r.title))) : (refTitleForScore ? 0 : 1)
    rec.abstractScore = ref.abstract && mine.abstract ? jaccard(tokenize(ref.abstract), tokenize(mine.abstract)) : (ref.abstract ? 0 : 1)
    const myHeadToks = mine.heads.map(tokenize)
    const refHeadToks = ref.heads.map(tokenize).filter((t) => t.length >= 2)
    rec.refSections = refHeadToks.length
    rec.sectionRecall = refHeadToks.length
      ? refHeadToks.filter((rh) => myHeadToks.some((mh) => jaccard(rh, mh) >= 0.6)).length / refHeadToks.length
      : 1
    rec.myHeadings = mine.heads
    rec.myHeadingCount = mine.heads.length
    rec.missingSample = missingSample

    // figure audit: multi-panel figures embed one raster image per panel,
    // so byte-identical duplicates count once; blank/small files are
    // reported separately.
    rec.figBlocks = mine.figureBlocks
    rec.refFigures = ref.figCount
    const figAudit = auditFigureFiles(dir)
    rec.figFiles = figAudit
    const uniqueRaster = Math.max(0, figAudit.count - figAudit.duplicates)
    const effectiveBlocks = uniqueRaster + mine.cropFigures
    rec.effectiveFigBlocks = effectiveBlocks
    rec.figDelta = Math.abs(effectiveBlocks - ref.figCount)

    // structure checks
    rec.pagebreaks = (r.html.match(/pp-pagebreak/g) || []).length
    rec.pages = r.pages
    rec.metas = mine.metas
    rec.firstIsP = mine.firstIsP
    rec.firstPLen = mine.firstPLen
    rec.giantParas = mine.giantParas

    // verdicts
    rec.fails = []
    if (rec.recall < 0.6) rec.fails.push(`recall ${rec.recall.toFixed(3)} < 0.6`)
    // Missing figures are a hard failure; phantom inflation must be extreme
    // (montage figures legitimately embed one raster image per panel, and
    // one vector figure can produce several density crops).
    if (rec.effectiveFigBlocks < ref.figCount * 0.6) rec.fails.push(`figures missing (${rec.effectiveFigBlocks} vs ${ref.figCount})`)
    if (rec.effectiveFigBlocks > ref.figCount * 3 && ref.figCount > 0) rec.fails.push(`figure inflation (${rec.effectiveFigBlocks} vs ${ref.figCount})`)
    if (rec.firstIsP && rec.firstPLen > 1500) rec.fails.push(`opens with giant paragraph (${rec.firstPLen} chars)`)
    if (rec.pagebreaks !== r.pages - 1) rec.fails.push(`pagebreaks ${rec.pagebreaks} != pages-1 ${r.pages - 1}`)
    if (rec.fails.length > 0) hardFails++

    console.log(`${id}: recall=${rec.recall.toFixed(3)} prec=${rec.precision.toFixed(3)} order=${rec.orderScore.toFixed(3)} title=${rec.titleScore.toFixed(2)} abstr=${rec.abstractScore.toFixed(2)} sect=${rec.sectionRecall.toFixed(2)} figs=${mine.figureBlocks}/${ref.figCount}${rec.fails.length ? ' FAIL[' + rec.fails.join('; ') + ']' : ''}`)
  } catch (err) {
    rec.error = String((err && err.message) || err).slice(0, 120)
    console.log(`${id}: ERROR ${rec.error}`)
  }
  results.push(rec)
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log('done ->', join(OUT, 'results.json'), '| hard fails:', hardFails)
process.exitCode = hardFails > 0 ? 1 : 0

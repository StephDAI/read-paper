// Evaluation harness: download recent astro-ph papers + their arXiv HTML
// versions, convert each PDF with the paper-review converter, and compare
// the converted text against the HTML reference.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { convertPdf } from '../lib/index.js'

const OUT = new URL('./run', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

function fetchUrl(url) {
  return execFileSync('curl', ['-sL', '--max-time', '60', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

// 1. Scrape the first N ids from the new listing
const listing = fetchUrl('https://arxiv.org/list/astro-ph/new')
const ids = [...listing.matchAll(/href="\/pdf\/(\d{4}\.\d{4,5})"/g)].map((m) => m[1])
const unique = [...new Set(ids)].slice(0, Number(process.env.PAPERS || 10))
console.log('papers:', unique)

function stripHtml(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s) {
  s = s.toLowerCase()
    .replace(/report github issue/g, ' ')
    .replace(/external links/g, ' ')
    .replace(/link cited by/g, ' ')
    .replace(/item \d+/g, ' ')
    .replace(/download pdf/g, ' ')
  return s.split(/[^a-z0-9]+/).filter(Boolean)
}

const results = []
for (const id of unique) {
  const rec = { id }
  try {
    // reference HTML
    const ref = fetchUrl(`https://arxiv.org/html/${id}v1`)
    if (!ref.includes('<article') && !ref.includes('ltx_abstract')) throw new Error('no html')
    const refText = stripHtml(ref)
    // PDF
    const pdfPath = join(OUT, `${id}.pdf`)
    if (!existsSync(pdfPath)) {
      execFileSync('curl', ['-sL', '--max-time', '120', '-o', pdfPath, `https://arxiv.org/pdf/${id}v1`])
    }
    // convert
    const dir = join(OUT, id)
    mkdirSync(dir, { recursive: true })
    const r = await convertPdf(pdfPath, dir)
    const mine = stripHtml(r.html)
    // metrics
    const rT = tokenize(refText)
    const mT = new Set(tokenize(mine))
    let overlap = 0
    for (const t of rT) if (mT.has(t)) overlap++
    rec.refTokens = rT.length
    rec.coverage = rT.length ? overlap / rT.length : 0
    rec.pages = r.pages
    rec.title = r.title
    rec.figs = (r.html.match(/pp-figcrop|pp-eq|<figure>/g) || []).length
    rec.htmlLen = r.html.length
    writeFileSync(join(dir, 'mine.txt'), stripHtml(r.html))
    writeFileSync(join(dir, 'ref.txt'), refText)
    console.log(`${id}: coverage=${rec.coverage.toFixed(3)} pages=${rec.pages} title="${String(rec.title).slice(0, 50)}" blocks=${rec.figs}`)
  } catch (err) {
    rec.error = String((err && err.message) || err).slice(0, 100)
    console.log(`${id}: ERROR ${rec.error}`)
  }
  results.push(rec)
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log('done ->', join(OUT, 'results.json'))

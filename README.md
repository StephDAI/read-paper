# paper-review

A paper-review panel for the **DeepSeek Harness**: upload a PDF paper and read
it as structured, selectable text beside the conversation, with figures and
display equations rendered visually.

## Features

- **PDF → structured text** (runs on the Harness host, via poppler):
  - two-column layout reconstruction (gutter detection + full-width line reassembly)
  - headings (size + all-caps normalization) and run-in heading splitting
  - tables (geometric column detection, wrapped-cell continuation)
  - sub/superscripts, dot-leader table of contents
  - scanned-PDF fallback to page images
- **Figures and display equations rendered as images** (`pdftoppm` crops +
  `pdfimages` raster extraction), with equation text kept as hidden spans so it
  stays searchable.
- **Right-side reader panel**: real third column when space allows (the harness
  `details` column), auto sidebar-collapse to make room, floating fallback for
  narrow windows, slim tab when collapsed.
- **Ask dialog**: select text → a small dialog appears → type a question
  ("explain this", "how does this relate to…") → the question plus the
  selection, its surrounding context, and the abstract are sent to the model.
- **Projects**: *Create project* materializes the paper (`paper.pdf`,
  `paper.md`, `paper.html`, figures, README with title/abstract) into a
  **Paper** workspace, opens a session there, and asks the agent to load the
  paper — each project keeps its own paper, so multiple papers coexist.

## Requirements

- DeepSeek Harness (dsh) installed.
- **poppler CLI tools** on PATH: `pdftotext`, `pdftoppm`, `pdfimages`.
  - macOS: `brew install poppler`
  - Debian/Ubuntu: `sudo apt-get install poppler-utils`

## Install

### From npm (recommended)

```bash
dsh plugin --profile readPaper add paper-review
# then start the harness:
dsh --profile readPaper
```

`dsh plugin` installs the package, then reconciles `dsh.profile.bundles` —
packages that declare `dsh.bundle` join the profile's layer stack
automatically.

### Manual install (no npm)

1. Copy this directory into `~/.dsh/profiles/readPaper/packages/paper-review`.
2. Make it resolvable (no pnpm needed):
   ```bash
   mkdir -p ~/.dsh/profiles/readPaper/node_modules
   ln -s ../packages/paper-review ~/.dsh/profiles/readPaper/node_modules/paper-review
   ```
3. Add `"paper-review"` to `dsh.profile.bundles` in
   `~/.dsh/profiles/readPaper/package.json`.
4. `dsh --profile readPaper`

## Usage

- **Paper** tab on the right edge opens the reader column.
- **Load PDF…** uploads (drag-and-drop onto the reader also works).
- Select text → the **ask dialog** appears → type a question, press Enter.
- **Create project** writes the paper into the `Paper` workspace and opens a
  session with the paper loaded as context.
- The converted documents are stored under `~/.dsh/paper-review/` and survive
  restarts.

## How it works

- `lib/index.js` (host half): HTTP routes (`/paper-review/…`) for upload,
  conversion, documents, figures, projects, and per-session stores. The
  converter extracts word geometry with `pdftotext -bbox`, rebuilds columns
  and lines, classifies blocks (headings, tables, ToC, math), and rasterizes
  figure/equation regions with `pdftoppm`.
- `lib/client.js` (client half): the panel, tab, ask dialog, and project
  flow. Ships as a hand-written `__ModuleLoader__` CJS bundle — no build step.
- `cordis.patch.yml`: the bundle patch that inserts the plugin row.

## Development

- `npm run check` — syntax checks.
- `npm run eval` — downloads 10 recent astro-ph papers with their arXiv HTML
  versions, converts them, and scores text coverage against the references
  (`PAPERS=2 npm run eval` for a quick run). The corpus lands in `eval/run/`
  (gitignored).

## Limitations

- Conversion fidelity depends on the PDF's text layer (scanned papers render
  as page images).
- Display equations are images (their text is preserved as hidden spans);
  inline math is reconstructed as sub/superscript text.
- Content that exists only as PDF annotations (e.g., giant author lists in
  some journals) cannot be extracted.
- The plugin's HTTP routes follow the harness's localhost trust model.

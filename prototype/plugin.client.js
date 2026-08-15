// Paper Review Panel — Client half.
// Reference copy of the dynamic Cordis Plugin Package `paper-1` / `pkg-1`.
// The live Package is defined in-process via cordis_define; edit and re-define there.
// Registers a floating, right-docked panel in the additive `shell.overlay` slot:
// upload a PDF (button or drag-and-drop) and read it with the browser's built-in viewer.

const MAX_BYTES = 30 * 1024 * 1024

const CSS = `
.pp-root {
  z-index: 70;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.pp-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-right: none;
  border-top-left-radius: 12px;
  border-bottom-left-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.pp-resize {
  position: absolute;
  left: -5px;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  z-index: 3;
}
.pp-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  cursor: grab;
  user-select: none;
}
.pp-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.pp-btn {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
  flex: none;
}
.pp-btn:hover {
  border-color: var(--dsw-alias-border-l2);
}
.pp-btn.pp-danger:hover {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.pp-input { display: none; }
.pp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
}
.pp-frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  background: #525659;
}
.pp-status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}
.pp-drop {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  border: 2px dashed var(--dsw-alias-border-l2);
  border-radius: 12px;
}
.pp-drop.pp-over {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.pp-drop-icon { font-size: 34px; line-height: 1; }
.pp-drop-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.pp-drop-hint { font-size: 12px; }
.pp-meta {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
}
.pp-meta-name {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pp-meta-size { flex: none; }
.pp-meta-hint { margin-left: auto; text-align: right; }
.pp-error {
  flex: none;
  margin: 12px 12px 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  border: 1px solid var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.pp-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-right: none;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
}
.pp-tab:hover { border-color: var(--dsw-alias-border-l2); }
.pp-tab-icon { font-size: 16px; line-height: 1; }
.pp-tab-label {
  writing-mode: vertical-rl;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--dsw-alias-label-secondary);
}
`

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function PaperPanel() {
  const [open, setOpen] = React.useState(true)
  const [width, setWidth] = React.useState(480)
  const [top, setTop] = React.useState(64)
  const [paper, setPaper] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [dragOver, setDragOver] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    host.call('paper/get').then((res) => {
      if (!alive || !res || typeof res.dataUrl !== 'string') return
      setPaper({ name: res.name, size: res.size, dataUrl: res.dataUrl })
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  async function uploadFile(file) {
    if (!file || busy) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name || ''))
    if (!isPdf) { setError('Please choose a PDF file.'); return }
    if (file.size > MAX_BYTES) { setError('This PDF is larger than the 30 MB limit.'); return }
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await readAsDataUrl(file)
      const res = await host.call('paper/upload', { name: String(file.name || 'paper.pdf'), size: file.size, dataUrl })
      if (!res || res.ok !== true) throw new Error((res && res.error) || 'Upload failed.')
      setPaper({ name: String(file.name || 'paper.pdf'), size: file.size, dataUrl })
      setOpen(true)
    } catch (err) {
      setError(String((err && err.message) || err))
    } finally {
      setBusy(false)
    }
  }

  function removePaper() {
    setPaper(null)
    setError(null)
    host.call('paper/clear').catch(() => {})
  }

  function startDrag(mode, e) {
    e.preventDefault()
    const target = e.currentTarget
    const startX = e.clientX
    const startY = e.clientY
    const startW = width
    const startT = top
    function onMove(ev) {
      if (mode === 'resize') {
        setWidth(Math.max(320, Math.min(1400, startW + (startX - ev.clientX))))
      } else {
        setTop(Math.max(0, Math.min(window.innerHeight - 140, startT + (ev.clientY - startY))))
      }
    }
    function onUp() {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    try { target.setPointerCapture(e.pointerId) } catch (err) {}
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const makeInput = () => React.createElement('input', {
    type: 'file',
    accept: 'application/pdf,.pdf',
    className: 'pp-input',
    onChange: (e) => {
      const f = e.target.files && e.target.files[0]
      e.target.value = ''
      uploadFile(f)
    },
  })

  if (!open) {
    return React.createElement(
      'div',
      { className: 'pp-root', style: { position: 'fixed', right: 0, top: top + 'px', pointerEvents: 'auto' } },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'pp-tab',
          title: paper ? ('Paper review \u2014 ' + paper.name) : 'Paper review',
          onClick: () => setOpen(true),
        },
        React.createElement('span', { className: 'pp-tab-icon' }, '\u{1F4C4}'),
        React.createElement('span', { className: 'pp-tab-label' }, 'Paper'),
      ),
    )
  }

  const headerButtons = [
    React.createElement(
      'label',
      { key: 'open', className: 'pp-btn', title: 'Open a PDF file' },
      'Open PDF\u2026',
      makeInput(),
    ),
  ]
  if (paper) {
    headerButtons.push(React.createElement(
      'a',
      { key: 'tab', className: 'pp-btn', href: paper.dataUrl, target: '_blank', rel: 'noreferrer', title: 'Open in a new browser tab' },
      'Open in tab',
    ))
    headerButtons.push(React.createElement(
      'button',
      { key: 'remove', type: 'button', className: 'pp-btn pp-danger', title: 'Remove the paper', onClick: removePaper },
      '\u00D7',
    ))
  }
  headerButtons.push(React.createElement(
    'button',
    { key: 'collapse', type: 'button', className: 'pp-btn', title: 'Collapse the panel', onClick: () => setOpen(false) },
    '\u203A',
  ))

  const header = React.createElement(
    'div',
    {
      className: 'pp-header',
      onPointerDown: (e) => {
        const t = e.target
        if (t && t.closest && (t.closest('button') || t.closest('label') || t.closest('a'))) return
        startDrag('move', e)
      },
    },
    React.createElement('span', { className: 'pp-title' }, paper ? paper.name : 'Paper review'),
    headerButtons,
  )

  let body
  if (busy) {
    body = React.createElement('div', { className: 'pp-status' }, 'Uploading PDF\u2026')
  } else if (paper) {
    body = React.createElement('iframe', {
      key: paper.name + ':' + paper.size,
      className: 'pp-frame',
      src: paper.dataUrl,
      title: paper.name,
    })
  } else {
    body = React.createElement(
      'label',
      {
        className: 'pp-drop' + (dragOver ? ' pp-over' : ''),
        onDragOver: (e) => { e.preventDefault(); setDragOver(true) },
        onDragLeave: () => setDragOver(false),
        onDrop: (e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
          uploadFile(f)
        },
      },
      React.createElement('span', { className: 'pp-drop-icon' }, '\u{1F4C4}'),
      React.createElement('span', { className: 'pp-drop-title' }, 'Drop a PDF here'),
      React.createElement('span', { className: 'pp-drop-hint' }, 'or click to choose a file \u00B7 up to 30 MB'),
      makeInput(),
    )
  }

  const err = error ? React.createElement('div', { className: 'pp-error' }, error) : null
  const meta = paper
    ? React.createElement(
        'div',
        { className: 'pp-meta' },
        React.createElement('span', { className: 'pp-meta-name' }, paper.name),
        React.createElement('span', { className: 'pp-meta-size' }, formatSize(paper.size)),
        React.createElement('span', { className: 'pp-meta-hint' }, 'Zoom and page controls live in the PDF toolbar'),
      )
    : null

  return React.createElement(
    'div',
    {
      className: 'pp-root',
      style: { position: 'fixed', right: 0, top: top + 'px', bottom: 0, width: width + 'px', pointerEvents: 'auto' },
    },
    React.createElement(
      'div',
      { className: 'pp-panel' },
      React.createElement('div', { className: 'pp-resize', title: 'Drag to resize', onPointerDown: (e) => startDrag('resize', e) }),
      header,
      err,
      React.createElement('div', { className: 'pp-body' }, body),
      meta,
    ),
  )
}

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    ctx.effect(() => styles.insert(CSS))
    ctx.effect(() => slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'paper-review.panel', label: 'Paper review' },
      () => React.createElement(PaperPanel, null),
    )))
  },
}

window.__ModuleLoader__.load({
  id: "paper-review",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require("react")

    var MAX_BYTES = 30 * 1024 * 1024
    var MAX_SELECTION = 8000

    var CSS = `
.pp-root {
  z-index: 70;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.pp-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1);
  border-left: 1px solid var(--dsw-alias-border-l1);
  overflow: hidden;
}
.pp-floating {
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
}
.pp-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
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
.pp-input { display: none; }
.pp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
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
.pp-note {
  flex: none;
  margin: 8px 12px 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
}
.pp-doc {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--dsw-alias-label-primary);
  user-select: text;
  cursor: text;
}
.pp-doc h1 { font-size: 20px; margin: 14px 0 8px; line-height: 1.3; }
.pp-doc h1.pp-doc-title { font-size: 22px; margin: 10px 0 6px; }
.pp-doc h2 { font-size: 17px; margin: 12px 0 6px; line-height: 1.3; }
.pp-doc h3 { font-size: 15px; margin: 10px 0 4px; line-height: 1.3; }
.pp-doc .pp-meta {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
.pp-doc .pp-abstract {
  margin: 0 0 10px;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-2);
  border-left: 3px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
}
.pp-doc p { margin: 0 0 8px; }
.pp-doc table {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.4;
}
.pp-doc th, .pp-doc td {
  border: 1px solid var(--dsw-alias-border-l1);
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
}
.pp-doc th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
.pp-doc figure { margin: 10px 0; text-align: center; }
.pp-doc figure img {
  max-width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
}
.pp-doc figcaption {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin-top: 4px;
}
.pp-pagebreak {
  margin: 16px 0 8px;
  text-align: center;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding-top: 8px;
}
.pp-toc {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 2px 0;
}
.pp-toc-entry {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pp-toc-page {
  flex: none;
  font-weight: 600;
}
.pp-math {
  text-align: center;
  margin: 10px 0;
  padding: 4px 8px;
  font-style: normal;
  color: var(--dsw-alias-label-primary);
}
.pp-figcrop {
  margin: 12px 0;
  text-align: center;
}
.pp-figcrop img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
.pp-eq {
  text-align: center;
  margin: 10px 0;
}
.pp-eq img {
  max-width: 100%;
  height: auto;
}
.pp-eq-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.pp-fresize {
  position: absolute;
  left: -5px;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  z-index: 3;
}
.pp-pageimg-wrap { margin: 8px 0; text-align: center; }
.pp-pageimg {
  max-width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
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
.pp-toast {
  position: fixed;
  z-index: 90;
  max-width: 460px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  word-break: break-all;
}
.pp-ask {
  position: fixed;
  z-index: 90;
  display: flex;
  gap: 6px;
  align-items: center;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);
  padding: 8px;
}
.pp-ask input {
  flex: 1;
  min-width: 0;
  width: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
}
.pp-ask input:focus { border-color: var(--dsw-alias-brand-primary); }
.pp-ask-close {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 6px;
}
.pp-ask-close:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.18)); }
.pp-ask-hl {
  position: fixed;
  z-index: 89;
  pointer-events: none;
  background: rgba(96, 135, 216, 0.3);
  border-radius: 2px;
  box-shadow: inset 0 0 0 0.5px rgba(96, 135, 216, 0.55);
}
`

    var state = {
      open: false,
      top: 64,
      paper: null,
      paperTitle: null,
      busy: false,
      error: null,
      dragOver: false,
      converting: false,
      fallback: false,
      docHtml: null,
      floating: false,
      fw: 640,
      viewGlobal: false,
      projectPath: null,
      toast: null,
      ask: null,
    }
    var toastTimer = null
    var listeners = []
    var layoutRef = null
    var workspacesRef = null
    var sessionsRef = null
    var sessionRef = { inputActions: null, sessionId: null }
    var panelEl = null
    var docEl = null
    var lastSelection = { text: '', rect: null, at: 0 }
    var docText = ''
    var currentSessionId = null
    var pendingSubmit = null

    function emit() {
      for (var i = 0; i < listeners.length; i++) listeners[i]()
    }

    function usePanelState() {
      var force = React.useReducer((x) => x + 1, 0)[1]
      React.useEffect(() => {
        listeners.push(force)
        return () => {
          var i = listeners.indexOf(force)
          if (i >= 0) listeners.splice(i, 1)
        }
      }, [])
      return state
    }

    function measureSidebarWidth() {
      var node = panelEl
      var p = node ? node.parentElement : null
      var guard = 0
      while (p && guard < 10) {
        if (p.children.length > 1) {
          var first = p.firstElementChild
          if (first && first !== node && !first.contains(node) && !node.contains(first)) {
            return first.clientWidth || 0
          }
        }
        node = p
        p = p.parentElement
        guard++
      }
      return 0
    }

    function canDock(viewportW, sidebarW) {
      return viewportW - sidebarW >= 940
    }

    function scheduleDockVerify() {
      window.setTimeout(() => {
        if (!state.open || state.floating) return
        var elW = panelEl ? panelEl.clientWidth : 0
        if (elW >= 10) return
        var vw = window.innerWidth
        var sw = measureSidebarWidth()
        if (sw > 120 && layoutRef) {
          layoutRef.toggleSidebar()
          if (canDock(vw, 56)) {
            layoutRef.openDetails()
            return
          }
        }
        state.floating = true
        emit()
      }, 420)
    }

    function retryDock() {
      if (!state.open || !layoutRef) return
      var vw = window.innerWidth
      var sw = measureSidebarWidth()
      if (canDock(vw, sw)) {
        layoutRef.openDetails()
        scheduleDockVerify()
        return
      }
      if (sw > 120) {
        layoutRef.toggleSidebar()
        if (canDock(vw, 56)) {
          layoutRef.openDetails()
          scheduleDockVerify()
          return
        }
      }
      state.floating = true
      emit()
    }

    function expand() {
      state.open = true
      state.floating = false
      emit()
      retryDock()
    }

    function collapse() {
      state.open = false
      state.floating = false
      emit()
      if (layoutRef) layoutRef.closeDetails()
    }

    function startFloatingResize(e) {
      e.preventDefault()
      var target = e.currentTarget
      var startX = e.clientX
      var startW = state.fw
      function onMove(ev) {
        state.fw = Math.max(320, Math.min(1100, startW + (startX - ev.clientX)))
        emit()
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

    function formatSize(bytes) {
      if (!bytes) return ''
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    }

    async function parseJson(res) {
      var text = ''
      try { text = await res.text() } catch (err) {}
      if (!res.ok) {
        throw new Error('Server error ' + res.status + ' — if this action is new, restart the Harness server (' + 'dsh --profile readPaper' + ').')
      }
      if (!text) throw new Error('Server returned an empty response — restart the Harness server if this persists.')
      try {
        return JSON.parse(text)
      } catch (err) {
        throw new Error('Server returned an unexpected response — restart the Harness server if this persists.')
      }
    }

    function sidQuery() {
      return state.viewGlobal ? '' : (currentSessionId || '')
    }

    function fetchDoc() {
      fetch('/paper-review/document.html?sessionId=' + encodeURIComponent(sidQuery())).then((res) => {
        if (!res.ok) return
        return res.text()
      }).then((html) => {
        if (typeof html !== 'string') return
        state.docHtml = html
        try {
          var doc = new DOMParser().parseFromString(html, 'text/html')
          docText = doc.body ? doc.body.textContent || '' : ''
        } catch (err) {
          docText = ''
        }
        emit()
      }).catch(() => {})
    }

    function refreshState() {
      fetch('/paper-review/state?sessionId=' + encodeURIComponent(sidQuery())).then(parseJson).then((s) => {
        if (!s || !s.present) return
        if (!state.paper || state.paper.name !== s.name || state.paper.size !== s.size) {
          state.paper = { name: s.name, size: s.size }
          emit()
        }
        if (s.title) { state.paperTitle = s.title; emit() }
        if (s.converting) {
          if (!state.converting) { state.converting = true; state.docHtml = null; emit() }
        } else if (s.ready) {
          if (state.converting) { state.converting = false; emit() }
          if (s.fallback !== state.fallback) { state.fallback = !!s.fallback; emit() }
          if (state.docHtml === null) fetchDoc()
        } else if (s.error) {
          state.converting = false
          state.error = s.error
          emit()
        }
      }).catch(() => {})
    }

    async function uploadFile(file) {
      if (!file || state.busy) return
      var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name || ''))
      if (!isPdf) { state.error = 'Please choose a PDF file.'; emit(); return }
      if (file.size > MAX_BYTES) { state.error = 'This PDF is larger than the 30 MB limit.'; emit(); return }
      state.busy = true
      state.error = null
      emit()
      try {
        var res = await fetch('/paper-review/upload', {
          method: 'POST',
          headers: { 'X-Paper-Name': encodeURIComponent(String(file.name || 'paper.pdf')) },
          body: file,
        })
        var result = await parseJson(res)
        if (!result || result.ok !== true) throw new Error((result && result.error) || 'Upload failed.')
        // The uploaded paper is staged globally (it becomes the NEXT project).
        state.viewGlobal = true
        state.paper = { name: result.name, size: result.size }
        state.converting = true
        state.fallback = false
        state.docHtml = null
        state.projectPath = null
        emit()
        expand()
      } catch (err) {
        state.error = String((err && err.message) || err)
        emit()
      } finally {
        state.busy = false
        emit()
      }
    }

    function makeInput() {
      return React.createElement('input', {
        type: 'file',
        accept: 'application/pdf,.pdf',
        className: 'pp-input',
        onChange: (e) => {
          var f = e.target.files && e.target.files[0]
          e.target.value = ''
          uploadFile(f)
        },
      })
    }

    function startTabDrag(e) {
      e.preventDefault()
      var target = e.currentTarget
      var startY = e.clientY
      var startT = state.top
      function onMove(ev) {
        state.top = Math.max(0, Math.min(window.innerHeight - 140, startT + (ev.clientY - startY)))
        emit()
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

    function closeAsk() {
      if (state.ask) { state.ask = null; emit() }
    }

    // Tight per-fragment rectangles of a range — each visual line of the
    // selection gets its own box, so partial-line selections highlight only
    // the selected text.
    function collectSelectionRects(range) {
      var list = range.getClientRects()
      var rects = []
      for (var i = 0; i < list.length; i++) {
        var r = list[i]
        if ((r.width > 0 || r.height > 0)) {
          rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
        }
      }
      return rects
    }

    function submitAsk(question) {
      var text = state.ask ? state.ask.text : ''
      closeAsk()
      var q = String(question || '').trim()
      if (!q) return
      var ia = sessionRef.inputActions
      if (!ia) { state.error = 'No active session to send the question to.'; emit(); return }
      var sel = text.length > MAX_SELECTION ? text.slice(0, MAX_SELECTION) + ' \u2026' : text
      var name = state.paperTitle || (state.paper ? state.paper.name : 'the paper')
      // Locate the selection in the converted text so the prompt can carry a
      // generous excerpt — the model answers directly from this material.
      var context = ''
      try {
        var idx = docText.indexOf(sel)
        if (idx < 0) {
          var compact = sel.replace(/\s+/g, '')
          var dcompact = docText.replace(/\s+/g, '')
          var ci = dcompact.indexOf(compact)
          if (ci >= 0) idx = ci
        }
        if (idx >= 0) {
          var start = Math.max(0, idx - 2000)
          var end = Math.min(docText.length, idx + sel.length + 800)
          context = docText.slice(start, end).replace(/\s+/g, ' ').trim()
        }
      } catch (err) {}
      var abstract = ''
      try { abstract = docText.slice(0, 1200).replace(/\s+/g, ' ').trim() } catch (err) {}
      var prompt = 'Answer the following question about the paper "' + name + '" directly from the material provided below. Do not search for files; the relevant paper content is already included here.\n\nQuestion: ' + q
      if (abstract) prompt += '\n\nPaper abstract:\n' + abstract
      if (context) prompt += '\n\nExcerpt around the selected passage:\n' + context
      prompt += '\n\nSelected passage:\n' + sel
      try {
        ia.setDraft(prompt)
        ia.submit()
      } catch (err) {
        state.error = String((err && err.message) || err)
        emit()
      }
    }

    function attemptAutoSubmit(tries) {
      if (!pendingSubmit) return
      if (sessionRef.inputActions && sessionRef.sessionId === pendingSubmit.sessionId) {
        var msg = pendingSubmit.message
        var sid = pendingSubmit.sessionId
        pendingSubmit = null
        try {
          sessionRef.inputActions.setDraft(msg)
          sessionRef.inputActions.submit()
        } catch (err) {
          state.error = String((err && err.message) || err)
          emit()
        }
        // Rename the session to the paper title after the agent processed the
        // first message (so the auto-generated title doesn't win).
        window.setTimeout(() => {
          var title = state.paperTitle || (state.paper ? state.paper.name : 'Paper')
          fetch('/paper-review/session-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sid, title }),
          }).catch(() => {})
        }, 4000)
        return
      }
      if (tries < 20) window.setTimeout(() => attemptAutoSubmit(tries + 1), 400)
    }

    function createProject() {
      state.error = null
      state.projectPath = null
      emit()
      fetch('/paper-review/project', { method: 'POST' }).then(parseJson).then((result) => {
        if (!result || result.ok !== true) throw new Error((result && result.error) || 'Could not create the project.')
        state.projectPath = result.path
        state.toast = { text: 'Project created: ' + result.path }
        if (toastTimer) window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => { state.toast = null; emit() }, 10000)
        emit()
        if (result.workspaceId && workspacesRef) {
          workspacesRef.connectWorkspace(result.workspaceId).then((sessionId) => {
            if (sessionsRef && sessionId) {
              try { sessionsRef.open(sessionId) } catch (err) {}
            }
            // Bind this session to the project so the viewer serves its paper.
            fetch('/paper-review/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, path: result.path }),
            }).catch(() => {})
            var title = state.paperTitle || (state.paper ? state.paper.name : 'paper')
            pendingSubmit = {
              sessionId,
              message: 'The paper "' + title + '" is stored in this project. Read ' + result.path + '/paper.md so the paper is loaded into context, then reply with a one-line summary of what the paper is about.',
            }
            attemptAutoSubmit(0)
          }).catch(() => {})
        }
      }).catch((err) => {
        state.error = String((err && err.message) || err)
        emit()
      })
    }

    function AskDialog() {
      var s = usePanelState()
      var value = React.useState('')
      var inputRef = React.useRef(null)
      if (!s.ask) return null
      // Keep the dialog within the viewer's width (docked column or floating
      // panel) with 12px padding on each side.
      var panelRect = panelEl ? panelEl.getBoundingClientRect() : null
      var availW = panelRect && panelRect.width > 0
        ? Math.max(220, panelRect.width - 24)
        : Math.min(360, window.innerWidth - 24)
      var width = Math.min(360, availW)
      var top = Math.max(12, Math.min(window.innerHeight - 90, s.ask.y))
      var left
      if (panelRect && panelRect.width > 0) {
        left = Math.max(panelRect.left + 12, Math.min(s.ask.x, panelRect.right - width - 12))
      } else {
        left = Math.max(12, Math.min(window.innerWidth - width - 12, s.ask.x))
      }
      // The input steals focus, which dims the browser's selection highlight;
      // draw one tight highlight per selected fragment so partial-line
      // selections stay visibly marked.
      var hl = null
      if (s.ask.rects && s.ask.rects.length > 0) {
        hl = s.ask.rects.map((r, i) => React.createElement('div', {
          key: i,
          className: 'pp-ask-hl',
          style: {
            left: Math.max(0, r.left) + 'px',
            top: Math.max(0, r.top) + 'px',
            width: Math.min(window.innerWidth, r.right - r.left) + 'px',
            height: Math.min(window.innerHeight, r.bottom - r.top) + 'px',
          },
        }))
      }
      React.useEffect(() => {
        function down(e) {
          // click outside closes
          if (!e.target || !e.target.closest || !e.target.closest('.pp-ask')) closeAsk()
        }
        function key(e) { if (e.key === 'Escape') closeAsk() }
        window.addEventListener('mousedown', down)
        window.addEventListener('keydown', key)
        // Make sure the input really owns the keyboard: focus it after the
        // mouseup race settles and pull focus back if anything steals it.
        var t = window.setTimeout(() => {
          if (inputRef.current) inputRef.current.focus()
        }, 60)
        return () => {
          window.removeEventListener('mousedown', down)
          window.removeEventListener('keydown', key)
          window.clearTimeout(t)
        }
      }, [])
      return React.createElement(
        React.Fragment,
        null,
        hl,
        React.createElement(
          'div',
          {
            className: 'pp-ask',
            style: { position: 'fixed', left: left + 'px', top: top + 'px', width: width + 'px', pointerEvents: 'auto' },
            // Keep app-level shortcuts (e.g. global Enter handlers) away from
            // the dialog's own keys.
            onKeyDown: (e) => e.stopPropagation(),
            onKeyUp: (e) => e.stopPropagation(),
            onKeyPress: (e) => e.stopPropagation(),
          },
          React.createElement('input', {
            ref: (el) => { inputRef.current = el },
            autoFocus: true,
            placeholder: 'Ask about the selection\u2026',
            value: value[0],
            onChange: (e) => value[1](e.target.value),
            onBlur: () => {
              // refocus on the next tick unless the dialog closed
              window.setTimeout(() => {
                if (state.ask && inputRef.current) inputRef.current.focus()
              }, 0)
            },
            onKeyDown: (e) => { if (e.key === 'Enter') submitAsk(value[0]) },
          }),
          React.createElement('button', { className: 'pp-btn', onClick: () => submitAsk(value[0]) }, 'Ask'),
          React.createElement('button', { className: 'pp-ask-close', title: 'Close', onClick: closeAsk }, '\u00D7'),
        ),
      )
    }

    function Tab() {
      var s = usePanelState()

      var ask = s.ask ? React.createElement(AskDialog, null) : null
      var toast = s.toast
        ? React.createElement(
            'div',
            { className: 'pp-toast', style: { position: 'fixed', right: 16, bottom: 16, zIndex: 90, pointerEvents: 'none' } },
            s.toast.text,
          )
        : null

      var tab = s.open
        ? null
        : React.createElement(
            'div',
            { className: 'pp-root', style: { position: 'fixed', right: 0, top: s.top + 'px', pointerEvents: 'auto' } },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'pp-tab',
                title: s.paper ? ('Paper review \u2014 ' + s.paper.name) : 'Paper review',
                onClick: expand,
                onPointerDown: startTabDrag,
              },
              React.createElement('span', { className: 'pp-tab-icon' }, '\u{1F4C4}'),
              React.createElement('span', { className: 'pp-tab-label' }, 'Paper'),
            ),
          )

      if (!ask && !tab && !toast) return null
      return React.createElement(React.Fragment, null, tab, ask, toast)
    }

    function Panel(props) {
      var s = usePanelState()
      var rootRef = React.useRef(null)
      sessionRef.inputActions = props && props.inputActions ? props.inputActions : null
      sessionRef.sessionId = props && props.sessionId ? props.sessionId : null

      if (props && props.sessionId !== currentSessionId) {
        currentSessionId = props.sessionId || null
        state.paper = null
        state.paperTitle = null
        state.docHtml = null
        state.converting = false
        state.fallback = false
        state.viewGlobal = false
        state.projectPath = null
        state.ask = null
        state.error = null
        docText = ''
        emit()
      }

      React.useEffect(() => {
        var el = rootRef.current
        panelEl = el
        if (state.open) {
          window.setTimeout(() => {
            if (state.open && panelEl && panelEl.clientWidth < 10 && !state.floating) retryDock()
          }, 300)
        }
        if (!el || typeof ResizeObserver === 'undefined') return
        var wasWide = el.clientWidth >= 10
        var ro = new ResizeObserver(() => {
          var nowWide = el.clientWidth >= 10
          if (state.open && !state.floating && wasWide && !nowWide) {
            retryDock()
          }
          wasWide = nowWide
        })
        ro.observe(el)
        return () => { ro.disconnect(); if (panelEl === el) panelEl = null }
      }, [])

      React.useEffect(() => {
        refreshState()
        var timer = window.setInterval(refreshState, 900)
        return () => window.clearInterval(timer)
      }, [props.sessionId, state.viewGlobal])

      var headerButtons = [
        React.createElement(
          'label',
          { key: 'load', className: 'pp-btn', title: 'Load a PDF file (replaces the current paper)' },
          'Load PDF\u2026',
          makeInput(),
        ),
      ]
      if (s.paper && !s.converting) {
        headerButtons.push(React.createElement(
          'button',
          {
            key: 'project',
            type: 'button',
            className: 'pp-btn',
            title: 'Create a project folder for this paper under the Paper workspace',
            onClick: createProject,
          },
          'Create project',
        ))
      }
      headerButtons.push(React.createElement(
        'button',
        { key: 'collapse', type: 'button', className: 'pp-btn', title: 'Close the view (keep the floating tab)', onClick: collapse },
        '\u203A',
      ))

      var header = React.createElement(
        'div',
        { className: 'pp-header' },
        React.createElement('span', { className: 'pp-title' }, s.paper ? s.paper.name : 'Paper review'),
        headerButtons,
      )

      var body
      if (s.busy) {
        body = React.createElement('div', { className: 'pp-status' }, 'Uploading PDF\u2026')
      } else if (!s.paper) {
        body = React.createElement(
          'label',
          {
            className: 'pp-drop' + (s.dragOver ? ' pp-over' : ''),
            onDragOver: (e) => { e.preventDefault(); state.dragOver = true; emit() },
            onDragLeave: () => { state.dragOver = false; emit() },
            onDrop: (e) => {
              e.preventDefault()
              state.dragOver = false
              emit()
              var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
              uploadFile(f)
            },
          },
          React.createElement('span', { className: 'pp-drop-icon' }, '\u{1F4C4}'),
          React.createElement('span', { className: 'pp-drop-title' }, 'Drop a PDF here'),
          React.createElement('span', { className: 'pp-drop-hint' }, 'or click to choose a file \u00B7 up to 30 MB'),
          makeInput(),
        )
      } else if (s.converting || s.docHtml === null) {
        body = React.createElement('div', { className: 'pp-status' }, 'Converting PDF to text\u2026')
      } else {
        body = React.createElement('div', {
          ref: (el) => { docEl = el },
          className: 'pp-doc',
          onDragOver: (e) => { e.preventDefault() },
          onDrop: (e) => {
            e.preventDefault()
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
            if (f) uploadFile(f)
          },
          onMouseUp: () => {
            window.setTimeout(() => {
              var sel = window.getSelection()
              var text = sel ? String(sel).trim() : ''
              if (!text) return
              var node = sel.anchorNode
              if (!node || !docEl || (!docEl.contains(node) && docEl !== node)) return
              try {
                var rects = collectSelectionRects(sel.getRangeAt(0))
                state.ask = {
                  x: rects.length > 0 ? rects[0].left : 120,
                  y: (rects.length > 0 ? rects[rects.length - 1].bottom : 160) + 8,
                  text,
                  rects,
                }
              } catch (err) {
                state.ask = { x: 120, y: 160, text, rects: [] }
              }
              emit()
            }, 30)
          },
          dangerouslySetInnerHTML: { __html: s.docHtml },
        })
      }

      var err = s.error ? React.createElement('div', { className: 'pp-error' }, s.error) : null
      var note = s.paper && s.fallback
        ? React.createElement('div', { className: 'pp-note' }, 'This PDF has no text layer, so pages are shown as images \u2014 selectable text is unavailable.')
        : s.floating
          ? React.createElement('div', { className: 'pp-note' }, 'The window is too narrow for the docked column, so the reader floats on top \u2014 drag its left edge to resize. Widen the window (or zoom out) to dock it.')
          : null

      var rootStyle = s.floating
        ? { position: 'fixed', right: 0, top: 0, bottom: 0, width: s.fw + 'px', zIndex: 60, pointerEvents: 'auto' }
        : null

      var resizeHandle = s.floating
        ? React.createElement('div', { className: 'pp-fresize', title: 'Drag to resize', onPointerDown: startFloatingResize })
        : null

      return React.createElement(
        'div',
        { ref: rootRef, className: 'pp-panel' + (s.floating ? ' pp-floating' : ''), style: rootStyle },
        resizeHandle,
        header,
        err,
        note,
        React.createElement('div', { className: 'pp-body' }, body),
      )
    }

    function apply(ctx) {
      var style = document.createElement('style')
      style.setAttribute('data-paper-review', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove())

      function onSelectionChange() {
        var sel = window.getSelection()
        var text = sel ? String(sel).trim() : ''
        if (!text || !sel.rangeCount) return
        var node = sel.anchorNode
        if (!node || !docEl || (!docEl.contains(node) && docEl !== node)) return
        var rects = []
        try {
          rects = collectSelectionRects(sel.getRangeAt(0))
        } catch (err) {}
        lastSelection = { text, rect: rects.length > 0 ? rects[0] : null, at: Date.now() }
        // Keep an open dialog in sync with an adjusted selection.
        if (state.ask) {
          state.ask.text = text
          state.ask.rects = rects
          if (rects.length > 0) {
            state.ask.x = rects[0].left
            state.ask.y = rects[rects.length - 1].bottom + 8
          }
          emit()
        }
      }
      document.addEventListener('selectionchange', onSelectionChange)
      ctx.effect(() => () => document.removeEventListener('selectionchange', onSelectionChange))

      function onWinResize() {
        if (state.open && state.floating && layoutRef) {
          var vw = window.innerWidth
          var sw = measureSidebarWidth()
          if (canDock(vw, sw)) {
            state.floating = false
            emit()
            layoutRef.openDetails()
            scheduleDockVerify()
          }
        }
      }
      window.addEventListener('resize', onWinResize)
      ctx.effect(() => () => window.removeEventListener('resize', onWinResize))

      layoutRef = ctx.layout
      workspacesRef = ctx.workspaces
      sessionsRef = ctx.sessions

      var slots = ctx.slots
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'paper-review.tab', label: 'Paper review' },
        () => React.createElement(Tab, null),
      ))
      slots.inject('details', () => slots.register(
        { name: 'details', priority: -1 },
        (props) => React.createElement(Panel, props),
      ))
    }

    exports.apply = apply
    exports.inject = ["slots", "layout", "workspaces", "sessions"]
    exports.name = "paper-review"
    return module.exports
  }
})

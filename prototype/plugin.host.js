// Paper Review Panel — Host half.
// Reference copy of the dynamic Cordis Plugin Package `paper-1` / `pkg-1`.
// The live Package is defined in-process via cordis_define; edit and re-define there.
// Host keeps the uploaded PDF (as a data URL) in memory for the Run lifetime and
// answers package-private RPC from the Client: paper/upload, paper/get, paper/clear.

return {
  apply(ctx) {
    const MAX_BYTES = 30 * 1024 * 1024
    let paper = null
    ctx.effect(() => {
      const disposers = [
        harness.handle('paper/upload', (args) => {
          if (!args || typeof args.dataUrl !== 'string' || args.dataUrl.indexOf('data:') !== 0) {
            return { ok: false, error: 'Missing or invalid PDF payload.' }
          }
          const size = Number(args.size) || 0
          if (size > MAX_BYTES) {
            return { ok: false, error: 'This PDF is larger than the 30 MB limit.' }
          }
          paper = {
            name: String(args.name || 'paper.pdf').slice(0, 200),
            size,
            dataUrl: args.dataUrl,
          }
          return { ok: true, name: paper.name, size: paper.size }
        }),
        harness.handle('paper/get', () => {
          if (paper === null) return null
          return { name: paper.name, size: paper.size, dataUrl: paper.dataUrl }
        }),
        harness.handle('paper/clear', () => {
          paper = null
          return { ok: true }
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    })
  },
}

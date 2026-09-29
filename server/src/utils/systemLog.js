const fs = require('fs');
const path = require('path');
const MAX_BYTES = 100000;
const logPath = () => path.resolve(process.env.SYSTEM_ERROR_LOG_PATH || path.join(__dirname, '../../logs/system-errors.jsonl'));

// Store only structural diagnostics, never request payloads or raw error messages.
async function recordSystemError(err, source = 'server') {
  let lock;
  let acquired = false;
  try {
    const file = logPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Serialize PM2 workers too. An abandoned lock expires after 30 seconds.
    lock = file + '.lock';
    for (let attempt = 0; attempt < 200; attempt++) {
      try { fs.mkdirSync(lock); acquired = true; break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.rmdirSync(lock); } catch { /* Another worker released it. */ }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    if (!acquired) { lock = null; throw new Error('Log busy'); }
    const event = {
      timestamp: new Date().toISOString(), source: String(source).replace(/[^\w/ .:-]/g, '').slice(0, 120),
      type: /^[\w]+$/.test(err?.name || '') ? err.name : 'Error',
      code: /^[A-Z0-9_]+$/.test(err?.code || '') ? err.code.slice(0, 80) : null,
      stack: String(err?.stack || '').split('\n').slice(1, 9)
        .filter(line => /^\s+at /.test(line)).map(line => line.replace(/\?.*?(?=:\d|\))/g, '').slice(0, 240)),
    };
    const entry = JSON.stringify(event) + '\n';
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
    lines.push(entry.trim());
    let bytes = Buffer.byteLength(lines.join('\n') + '\n');
    while (bytes > MAX_BYTES && lines.length) bytes -= Buffer.byteLength(lines.shift() + '\n');
    fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 });
  } catch { console.error('Unable to write system error log'); }
  finally { if (lock && acquired) { try { fs.rmdirSync(lock); } catch { /* Already released. */ } } }
}
function readSystemErrors() {
  const file = logPath();
  if (!fs.existsSync(file)) return { entries: [], bytes: 0, maxBytes: MAX_BYTES };
  const text = fs.readFileSync(file, 'utf8');
  const entries = text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).reverse();
  return { entries, bytes: Buffer.byteLength(text), maxBytes: MAX_BYTES };
}
module.exports = { recordSystemError, readSystemErrors, MAX_BYTES };

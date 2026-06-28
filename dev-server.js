// Minimal local dev server: serves the static site AND runs api/tryon.js,
// so the Try-On feature works locally without Vercel.
//
//   GEMINI_API_KEY=your_key  node dev-server.js
//   # or put GEMINI_API_KEY=your_key in a .env file, then: node dev-server.js
//
// Then open http://localhost:3000/product.html?id=1
//
// Zero dependencies — Node 18+ (uses built-in fetch).

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// Load a .env file (KEY=value lines) into process.env if present.
(function loadDotenv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* no .env, that's fine */ }
})();

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// Wrap a bare Node res with the Vercel-style helpers our handler expects.
function vercelify(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

const tryonHandler = require('./api/tryon.js');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // API route
  if (url.pathname === '/api/tryon') {
    return tryonHandler(req, vercelify(res));
  }

  // Static files
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(PORT, () => {
  const keyOk = !!process.env.GEMINI_API_KEY;
  console.log(`\n  Ginni Cloths dev server → http://localhost:${PORT}`);
  console.log(`  Try-On page            → http://localhost:${PORT}/product.html?id=1`);
  console.log(`  GEMINI_API_KEY         → ${keyOk ? 'loaded ✓' : 'MISSING ✗ (Try-On will return a config error)'}\n`);
});

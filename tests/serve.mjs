import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  try {
    if (pathname === '/__lab') {
      let html = await fs.readFile('dist/index.html', 'utf8');
      html = html.replace('<head>', '<head><script src="/__lab-setup.js"></script>');
      html = html.slice(0, html.indexOf('<script>\n  /* Cache hors ligne')) + '</body></html>';
      response.setHeader('Content-Type', 'text/html'); response.end(html); return;
    }
    const file = pathname === '/__lab-setup.js' ? 'tests/browser-fixture.js' : path.join('dist', pathname === '/' ? 'index.html' : pathname);
    if (file.includes('..')) throw Error('Invalid path');
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store'); response.end(await fs.readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(8776, '127.0.0.1', () => console.log('Test server: http://127.0.0.1:8776/__lab'));

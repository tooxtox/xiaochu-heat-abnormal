import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function startServer(root = projectRoot, port = 0, host = '127.0.0.1') {
  root = path.resolve(root);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
  const server = http.createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
      let file = path.resolve(root, relative || 'index.html');
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
      let info = await stat(file);
      if (info.isDirectory()) { file = path.join(file, 'index.html'); info = await stat(file); }
      let start = 0, end = info.size - 1, status = 200;
      const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(info.size - 1, Number(match[2])) : info.size - 1;
        }
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || info.size === 0) { res.end(); return; }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 4173);
  const { url } = await startServer(projectRoot, port);
  console.log(`Preview: ${url}`);
}

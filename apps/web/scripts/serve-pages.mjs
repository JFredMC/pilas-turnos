// Sirve el build de Pages (dist) bajo /pilas-turnos/ como GitHub Pages, para las pruebas e2e.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve('dist/pilas-turnos/browser');
const tipos = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const puerto = Number(process.env.PORT ?? 4322);
http
  .createServer((q, r) => {
    const ruta = decodeURIComponent((q.url ?? '/').split('?')[0]).replace(/^\/pilas-turnos/, '');
    let f = path.join(raiz, path.normalize(ruta));
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory())
      f = path.join(raiz, 'index.html');
    r.writeHead(200, { 'content-type': tipos[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  })
  .listen(puerto, () => console.log(`Pages en http://localhost:${puerto}/pilas-turnos/`));

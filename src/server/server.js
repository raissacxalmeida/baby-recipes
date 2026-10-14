import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppError } from './errors.js';
import { generateRecipe } from './generate.js';
import { callModel } from './openai.js';

const MAX_BODY = 100 * 1024;
const STATUS = { 'invalid-input': 400, 'too-young': 422, 'generation-failed': 502, 'upstream-error': 502, 'missing-key': 500 };
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () =>
      tooBig ? reject(new AppError('invalid-input', 'Request too large')) : resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleRecipe(req, res, generate) {
  try {
    let input;
    try {
      input = JSON.parse(await readBody(req));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('invalid-input', 'Request body must be valid JSON');
    }
    sendJson(res, 200, { recipe: await generate(input) });
  } catch (err) {
    if (err instanceof AppError) {
      sendJson(res, STATUS[err.code] ?? 500, { error: err.code, message: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'server-error', message: 'Something went wrong' });
    }
  }
}

function serveStatic(req, res, root) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = null;
  }
  const file = pathname === null ? null : path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file || !file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

export function createServer({ generate, staticDir }) {
  const root = path.resolve(staticDir);
  return http.createServer((req, res) => {
    // Blocks DNS-rebinding pages; only local host names are served.
    if (!LOCAL_HOSTS.includes((req.headers.host ?? '').replace(/:\d+$/, ''))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    const pathname = (req.url ?? '').split('?')[0];
    if (req.method === 'POST' && pathname === '/api/recipe') {
      // A JSON content type forces a CORS preflight, so other websites cannot trigger a call.
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
        return sendJson(res, 415, { error: 'invalid-input', message: 'Send the request as JSON' });
      }
      return handleRecipe(req, res, generate);
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, root);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  loadEnv(path.join(repoRoot, '.env'));
  const root = path.join(repoRoot, 'dist');
  const server = createServer({
    staticDir: root,
    generate: (input) =>
      generateRecipe(input, {
        callModel: (i) => callModel(i, { apiKey: process.env.OPENAI_API_KEY }),
        now: () => new Date(),
      }),
  });
  server.listen(3000, '127.0.0.1', () => console.log('Open http://127.0.0.1:3000'));
}

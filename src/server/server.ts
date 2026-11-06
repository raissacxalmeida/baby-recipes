import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { AppError } from './errors.js';
import { isObject } from './guards.js';
import { sessionUser } from './sessions.js';
import { routes } from './routes/index.js';
import type { Config, Db, ModelCall, Route, RouteResult, TranslateCall } from './types.js';

const MAX_BODY = 100 * 1024;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
const SESSION_MAX_AGE = 30 * 24 * 3600;
const STATUS: Record<string, number> = {
  'invalid-input': 400, unauthorized: 401, forbidden: 403, 'not-found': 404, conflict: 409,
  'too-young': 422, locked: 429, 'limit-reached': 429, 'missing-key': 500,
  'generation-failed': 502, 'upstream-error': 502,
};
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, text: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks: Buffer[] = [];
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

function parseCookies(header = ''): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

type CompiledRoute = Route & { keys: string[]; re: RegExp };

function compile(route: Route): CompiledRoute {
  const keys: string[] = [];
  const source = route.pattern.replace(/:[A-Za-z]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  return { ...route, keys, re: new RegExp(`^${source}$`) };
}

function matchRoute(compiled: CompiledRoute[], method: string | undefined, pathname: string): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of compiled) {
    if (route.method !== method) continue;
    const m = route.re.exec(pathname);
    if (!m) continue;
    try {
      return { route, params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, root: string, pathname: string) {
  let file: string | null = null;
  try {
    file = path.resolve(root, `.${decodeURIComponent(pathname) === '/' ? '/index.html' : decodeURIComponent(pathname)}`);
  } catch {
    file = null;
  }
  const inside = file !== null && file.startsWith(root + path.sep);
  let target = file !== null && inside && existsSync(file) && statSync(file).isFile() ? file : null;
  // Pages such as /admin and /invite/<token> are drawn by the React app.
  if (!target && inside && !path.extname(pathname)) target = path.join(root, 'index.html');
  if (!target || !existsSync(target)) return sendText(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream', ...SECURITY_HEADERS });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(target);
  stream.on('error', () => res.end());
  return stream.pipe(res);
}

export interface ServerDeps {
  db: Db;
  config: Config;
  callModel: ModelCall;
  callTranslate: TranslateCall;
  now?: () => Date;
  staticDir: string;
}

export function createServer({ db, config, callModel, callTranslate, now = () => new Date(), staticDir }: ServerDeps): http.Server {
  const root = path.resolve(staticDir);
  const compiled = routes.map(compile);

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
    const found = matchRoute(compiled, req.method, pathname);
    if (!found) throw new AppError('not-found', 'Not found', { key: 'err.notFound' });
    const { route, params } = found;
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
      throw new AppError('invalid-input', 'Missing X-Requested-With header');
    }
    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      const raw = await readBody(req);
      if (raw.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new AppError('invalid-input', 'Request body must be valid JSON');
        }
        if (!isObject(parsed) || Array.isArray(parsed)) {
          throw new AppError('invalid-input', 'Request body must be a JSON object');
        }
        body = parsed;
      }
    }
    const sessionToken: string | undefined = parseCookies(req.headers.cookie).session;
    // Which baby the request is for; a repeated header counts by its first value.
    const babyId: string | undefined = req.headersDistinct['x-baby-id']?.[0];
    const context = { db, params, body, now, config, callModel, callTranslate, sessionToken, babyId };
    let result: RouteResult;
    if (route.access === 'public') {
      result = await route.handler({ ...context, user: null });
    } else {
      const user = await sessionUser(db, sessionToken, now());
      if (!user) throw new AppError('unauthorized', 'Please log in', { key: 'err.notLoggedIn' });
      if (route.access === 'admin' && !user.isAdmin) throw new AppError('forbidden', 'Not allowed', { key: 'err.notAllowed' });
      result = await route.handler({ ...context, user });
    }
    const headers: Record<string, string> = {};
    if (result.setSession) headers['Set-Cookie'] = sessionCookie(result.setSession, SESSION_MAX_AGE, config.cookieSecure);
    if (result.clearSession) headers['Set-Cookie'] = sessionCookie('', 0, config.cookieSecure);
    sendJson(res, result.status ?? 200, result.body ?? {}, headers);
  }

  return http.createServer(async (req, res) => {
    // Only the configured host names are served (blocks DNS-rebinding pages).
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!config.allowedHosts.includes(host)) return sendText(res, 403, 'Forbidden');
    const pathname = (req.url ?? '').split('?')[0];
    try {
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, root, pathname);
      return sendText(res, 404, 'Not found');
    } catch (err) {
      if (err instanceof AppError) {
        return sendJson(res, STATUS[err.code] ?? 500, {
          error: err.code,
          message: err.message,
          ...(err.key ? { key: err.key, ...(err.params ? { params: err.params } : {}) } : {}),
        });
      }
      console.error('Unhandled error:', err instanceof Error ? err.name : typeof err, err instanceof Error ? err.message : String(err));
      return sendJson(res, 500, { error: 'server-error', message: 'Something went wrong', key: 'err.generic' });
    }
  });
}

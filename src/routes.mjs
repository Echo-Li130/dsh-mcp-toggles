/**
 * The three HTTP handlers behind the settings page.
 *
 * They are HTTP-shaped but harness-free: the caller injects how to find the
 * patch and how to serialise writes, which is what lets the tests drive them
 * with fake requests.
 *
 * Every route answers loopback callers only: the socket address must be a
 * loopback address *and* the `Host` header must name localhost, so a page that
 * merely resolves to 127.0.0.1 cannot reach it through a proxied origin.
 */
import fs from 'node:fs';
import { readServers, setDisabled } from './patch.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 64 * 1024;
const ID_RE = /^mcp-[\w-]+$/;

export function isLocal(req) {
  const address = (req && req.socket && req.socket.remoteAddress) || '';
  if (!LOOPBACK.has(address)) return false;

  const raw = String((req && req.headers && req.headers.host) || '');
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0];
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

export function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

export function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const messageOf = (error) => String((error && error.message) || error);

export function createHandlers({ findConfigPath, serial, panelFile }) {
  /** Read the patch fresh: a row added by any other tool shows up on the next call. */
  const snapshot = () => {
    const file = findConfigPath();
    if (!file) return { ok: false, error: 'profile patch not found' };
    return { ok: true, configPath: file, servers: readServers(fs.readFileSync(file, 'utf8')).servers };
  };

  return {
    async list(req, res) {
      if (!isLocal(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
      try {
        const state = snapshot();
        return sendJson(res, state.ok ? 200 : 404, state);
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: messageOf(error) });
      }
    },

    async toggle(req, res) {
      if (!isLocal(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return sendJson(res, 415, { ok: false, error: 'application/json required' });
      }

      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const id = String(body.id || '');
        const disabled = body.disabled === true;
        if (!ID_RE.test(id)) return sendJson(res, 400, { ok: false, error: 'invalid id' });

        const file = findConfigPath();
        if (!file) return sendJson(res, 404, { ok: false, error: 'profile patch not found' });

        const result = await serial(() => {
          const edit = setDisabled(fs.readFileSync(file, 'utf8'), id, disabled);
          if (!edit.ok) return edit;
          if (edit.changed) {
            try {
              fs.copyFileSync(file, `${file}.bak`);
            } catch {
              /* the backup is a convenience; the atomic write is the guarantee */
            }
            const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
            fs.writeFileSync(tmp, edit.text, 'utf8');
            fs.renameSync(tmp, file);
          }
          const servers = readServers(fs.readFileSync(file, 'utf8')).servers;
          return {
            ok: true,
            changed: edit.changed,
            server: servers.find((server) => server.id === id) || null,
            configPath: file,
          };
        });

        return sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: messageOf(error) });
      }
    },

    async panel(req, res) {
      if (!isLocal(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      try {
        const html = fs.readFileSync(panelFile, 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: `panel missing: ${messageOf(error)}` });
      }
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHandlers, isLocal, readBody } from '../src/routes.mjs';

function fakeRequest({ method = 'GET', headers = {}, body = '', remoteAddress = '127.0.0.1' } = {}) {
  const req = new Readable({ read() {} });
  req.method = method;
  req.headers = { host: '127.0.0.1:56804', ...headers };
  req.socket = { remoteAddress };
  if (body) req.push(body);
  req.push(null);
  return req;
}

function fakeResponse() {
  return {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      this.body = chunk || '';
    },
  };
}

const json = (res) => JSON.parse(res.body);

test('isLocal accepts loopback sockets with a localhost Host header', () => {
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    for (const host of ['127.0.0.1:56804', 'localhost:56804', '[::1]:56804', 'localhost']) {
      assert.equal(isLocal({ socket: { remoteAddress }, headers: { host } }), true, `${remoteAddress} ${host}`);
    }
  }
});

test('isLocal rejects other sockets and spoofed hosts', () => {
  assert.equal(isLocal({ socket: { remoteAddress: '192.168.1.5' }, headers: { host: '127.0.0.1' } }), false);
  assert.equal(isLocal({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'evil.example.com' } }), false);
  assert.equal(isLocal({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), false);
  assert.equal(isLocal({}), false);
});

test('readBody rejects a body over the limit', async () => {
  const req = fakeRequest({ method: 'POST', body: 'x'.repeat(70 * 1024) });
  await assert.rejects(readBody(req), /too large/);
});

test('list refuses anything but loopback', async () => {
  const handlers = createHandlers({ findConfigPath: () => null, serial: (task) => task(), panelFile: '' });
  const res = fakeResponse();
  await handlers.list(fakeRequest({ remoteAddress: '10.0.0.7' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(json(res).ok, false);
});

test('list reports a missing profile patch as 404', async () => {
  const handlers = createHandlers({ findConfigPath: () => null, serial: (task) => task(), panelFile: '' });
  const res = fakeResponse();
  await handlers.list(fakeRequest(), res);
  assert.equal(res.statusCode, 404);
  assert.match(json(res).error, /not found/);
});

test('toggle rejects a malformed id before touching any file', async () => {
  const handlers = createHandlers({ findConfigPath: () => null, serial: (task) => task(), panelFile: '' });
  const res = fakeResponse();
  const req = fakeRequest({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: '../etc/passwd', disabled: true }),
  });
  await handlers.toggle(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(json(res).error, /invalid id/);
});

test('toggle requires a JSON content type', async () => {
  const handlers = createHandlers({ findConfigPath: () => null, serial: (task) => task(), panelFile: '' });
  const res = fakeResponse();
  await handlers.toggle(fakeRequest({ method: 'POST', body: '{}' }), res);
  assert.equal(res.statusCode, 415);
});

test('toggle round-trips a real file and keeps a backup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-toggles-'));
  const file = path.join(dir, 'cordis.patch.yml');
  const original = '- id: mcp-example\n  serverName: example\n  transport: stdio\n';
  fs.writeFileSync(file, original, 'utf8');

  const handlers = createHandlers({ findConfigPath: () => file, serial: (task) => task(), panelFile: '' });

  const off = fakeResponse();
  await handlers.toggle(
    fakeRequest({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'mcp-example', disabled: true }),
    }),
    off,
  );
  assert.equal(off.statusCode, 200);
  assert.equal(json(off).changed, true);
  assert.equal(json(off).server.disabled, true);
  assert.match(fs.readFileSync(file, 'utf8'), /disabled: true/);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), original);

  const on = fakeResponse();
  await handlers.toggle(
    fakeRequest({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'mcp-example', disabled: false }),
    }),
    on,
  );
  assert.equal(json(on).changed, true);
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  const listing = fakeResponse();
  await handlers.list(fakeRequest(), listing);
  assert.equal(listing.statusCode, 200);
  assert.equal(json(listing).servers.length, 1);
  assert.equal(json(listing).configPath, file);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the fallback panel is served only to loopback and reports a missing file', async () => {
  const handlers = createHandlers({ findConfigPath: () => null, serial: (task) => task(), panelFile: '' });

  const remote = fakeResponse();
  await handlers.panel(fakeRequest({ remoteAddress: '10.0.0.7' }), remote);
  assert.equal(remote.statusCode, 403);

  const missing = fakeResponse();
  await handlers.panel(fakeRequest(), missing);
  assert.equal(missing.statusCode, 500);
  assert.match(json(missing).error, /panel missing/);
});

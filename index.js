/**
 * dsh-mcp-toggles — host half.
 *
 * Registers three routes on the harness's own web server:
 *
 *   GET  /api/mcp-toggles/servers   list the `mcp-*` loader rows of the profile patch
 *   POST /api/mcp-toggles/toggle    set one row's `disabled:` field (atomic write, .bak)
 *   GET  /mcp-toggles               fallback page for when the settings entry is missing
 *
 * No third-party packages: `node:` built-ins only, so the bundle installs with
 * nothing to audit. The rendering lives in `client.js`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfigPath } from './src/profile.mjs';
import { createHandlers } from './src/routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL_FILE = path.join(HERE, 'public', 'panel.html');

export const name = 'mcp-toggles';
export const inject = ['webServer'];

export function apply(ctx) {
  // One write at a time: two quick clicks must not interleave read-modify-write.
  const queue = { tail: Promise.resolve() };
  const serial = (task) => {
    const next = queue.tail.then(task, task);
    queue.tail = next.catch(() => {});
    return next;
  };

  const handlers = createHandlers({ findConfigPath, serial, panelFile: PANEL_FILE });
  const routes = [
    ctx.webServer.register({ kind: 'exact', path: '/api/mcp-toggles/servers', handler: handlers.list }),
    ctx.webServer.register({ kind: 'exact', path: '/api/mcp-toggles/toggle', handler: handlers.toggle }),
    ctx.webServer.register({ kind: 'exact', path: '/mcp-toggles', handler: handlers.panel }),
  ];

  ctx.effect(
    () => () => {
      for (const off of routes) {
        if (typeof off !== 'function') continue;
        try {
          off();
        } catch {
          /* already torn down */
        }
      }
    },
    'mcp-toggles: routes',
  );
}

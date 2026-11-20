/**
 * dsh-mcp-toggles — host half.
 *
 * Registers three routes on the harness's own web server:
 *
 *   GET  /api/mcp-toggles/servers   list the `mcp-*` loader rows of the profile patch
 *   POST /api/mcp-toggles/toggle    set one row's `disabled:` field (atomic write, .bak)
 *   GET  /mcp-toggles               fallback page for when the sidebar entry is missing
 *
 * Each listed server also carries its one-line introduction (this plugin's
 * `config.descriptions`, keyed by `serverName`) and its current tool count from
 * the harness tool registry; neither changes how a switch writes the file.
 * Only `@deepseek-ai/dsh-mcp-client` rows count as servers, so this plugin's
 * own `mcp-toggles` config row never shows up in the list.
 *
 * No third-party packages: `node:` built-ins only, so the bundle installs with
 * nothing to audit. The rendering lives in `client.js`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeServer, readDescriptions, summarizeTools } from './src/describe.mjs';
import { findConfigPath } from './src/profile.mjs';
import { createHandlers } from './src/routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL_FILE = path.join(HERE, 'public', 'panel.html');

export const name = 'mcp-toggles';
export const inject = ['webServer'];

/**
 * Read the current global tool definitions, if the registry is available.
 * @param ctx - the host plugin context.
 * @returns the definitions, or an empty list when tools cannot be read.
 */
function toolDefinitions(ctx) {
  try {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined;
    if (!tools || typeof tools.definitions !== 'function') return [];
    return tools.definitions();
  } catch {
    /* a missing or throwing registry only costs the tool count */
    return [];
  }
}

export function apply(ctx, config = {}) {
  // `descriptions` is optional user configuration on this plugin's loader row;
  // a missing or malformed map simply means every row uses its generic line.
  const descriptions = readDescriptions(config);
  const enrich = (server) => ({
    description: describeServer(server, descriptions),
    tools: summarizeTools(toolDefinitions(ctx), server.name),
  });

  // One write at a time: two quick clicks must not interleave read-modify-write.
  const queue = { tail: Promise.resolve() };
  const serial = (task) => {
    const next = queue.tail.then(task, task);
    queue.tail = next.catch(() => {});
    return next;
  };

  const handlers = createHandlers({ findConfigPath, serial, panelFile: PANEL_FILE, enrich });
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

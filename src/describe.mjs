/**
 * Per-server one-line introductions and tool counts.
 *
 * The introduction text is user-owned configuration, not server data: it is
 * read from this plugin's own loader row (`config.descriptions` in the profile
 * patch), keyed by `serverName` (or by the loader row id). Nothing here writes
 * anything; the host half passes the parsed table to the list route, which
 * merges it into each row.
 *
 * Tool names come from the harness tool registry: every bridged tool is named
 * `mcp__<serverName>__<rawName>`, so the count is the server's visible tool
 * list without connecting to it again.
 */

/** A parsed `serverName`/row-id to introduction table. */
export function readDescriptions(config) {
  const source = config && typeof config === 'object' ? config.descriptions : undefined;
  const table = Object.create(null);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return table;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    const name = String(key == null ? '' : key).trim().toLowerCase();
    if (!name || !text) continue;
    table[name] = text;
  }
  return table;
}

/**
 * Resolve one server's introduction: `serverName` first, then the loader id.
 * @param server - parsed server row (`name` is the `serverName`, `id` the row id).
 * @param descriptions - table returned by {@link readDescriptions}.
 * @returns the introduction, or `''` when none is configured.
 */
export function describeServer(server, descriptions) {
  if (!server || !descriptions) return '';
  const name = String(server.name == null ? '' : server.name).trim().toLowerCase();
  const id = String(server.id == null ? '' : server.id).trim().toLowerCase();
  return descriptions[name] || descriptions[id] || '';
}

/**
 * Count the tools one server currently exposes.
 * @param definitions - tool definitions from the harness registry (may be undefined).
 * @param serverName - the server's stable `serverName` namespace.
 * @returns the count and up to five raw tool names (without the server prefix).
 */
export function summarizeTools(definitions, serverName) {
  const name = String(serverName == null ? '' : serverName);
  const prefix = `mcp__${name}__`;
  const names = [];
  if (Array.isArray(definitions)) {
    for (const definition of definitions) {
      const publicName = definition && definition.name;
      if (typeof publicName !== 'string' || !publicName.startsWith(prefix)) continue;
      const raw = publicName.slice(prefix.length);
      if (raw) names.push(raw);
    }
  }
  return { count: names.length, names: names.slice(0, 5) };
}

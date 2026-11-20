/**
 * Text-level helpers for a Cordis profile patch (`cordis.patch.yml`).
 *
 * Everything here is a pure function over strings: the caller reads the file,
 * edits the text here, and writes it back. That keeps the delicate part —
 * finding one row and touching only its `disabled:` line — testable without a
 * running harness.
 *
 * Guarantees the rest of the plugin relies on:
 *   - line endings, a leading BOM, and the trailing newline survive an edit;
 *   - every byte outside the edited line is preserved verbatim;
 *   - group nodes (`name: cordis:group`), non-client `mcp-*` rows (such as this
 *     plugin's own config row) and rows whose `disabled:` is a loader
 *     expression are reported, never silently rewritten.
 */

const BOM = '\uFEFF';
const ROW_RE = /^(\s*)-\s+id:\s*([\w.-]+)\s*$/;
const ID_LINE_RE = /^(\s*)-\s+id:\s*/;
const DISABLED_ANY_RE = /^\s*disabled:\s*/;
const DISABLED_BOOL_RE = /^\s*disabled:\s*(true|false)\s*$/;
const GROUP_RE = /name:\s*['"]?cordis:group/;
// Only dsh-mcp-client rows are servers. The same profile file also holds this
// plugin's own `mcp-toggles` config row, whose id happens to share the prefix.
const CLIENT_RE = /^\s*name:\s*['"]?@deepseek-ai\/dsh-mcp-client['"]?\s*(?:#.*)?$/m;

const isMcpRow = (id) => id.startsWith('mcp-');

const unquote = (value) => String(value == null ? '' : value).trim().replace(/^['"]|['"]$/g, '');

/**
 * Split a patch document into lines plus the three details an edit must keep:
 * whether it starts with a BOM, which newline style it uses, and whether it
 * ends with a newline.
 */
export function scanDocument(text) {
  const source = String(text == null ? '' : text);
  const bom = source.startsWith(BOM);
  const body = bom ? source.slice(1) : source;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const trailingEol = body.endsWith('\n');
  const lines = body.split(/\r\n|\n/);
  if (trailingEol) lines.pop();
  return { bom, eol, trailingEol, lines };
}

export function joinDocument({ bom, eol, trailingEol, lines }) {
  return (bom ? BOM : '') + lines.join(eol) + (trailingEol ? eol : '');
}

/**
 * Every loader row whose id starts with `mcp-`, at any nesting depth.
 *
 * A block runs from its `- id:` line to the next sibling (or shallower) `- id:`
 * line, a comment separator, or the end of the document.
 */
export function findBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(ROW_RE);
    if (!match || !isMcpRow(match[2])) continue;
    const indent = match[1].length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].match(ID_LINE_RE);
      if (next && next[1].length <= indent) {
        end = cursor;
        break;
      }
      if (/^\s*#\s*-{2,}/.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    blocks.push({ id: match[2], start: index, end, indent });
  }
  return blocks;
}

/** Read one block into the shape the page renders, or null for a group or a non-client row. */
export function parseBlock(lines, block) {
  const body = lines.slice(block.start, block.end);
  const text = body.join('\n');
  if (GROUP_RE.test(text)) return null;
  // An `mcp-*` id alone is not enough: this plugin's own row uses that prefix.
  if (!CLIENT_RE.test(text)) return null;

  const pick = (pattern) => {
    const match = text.match(pattern);
    return match ? unquote(match[1]) : '';
  };

  const args = [];
  const argsStart = body.findIndex((line) => /^\s*args:\s*$/.test(line));
  if (argsStart >= 0) {
    for (let cursor = argsStart + 1; cursor < body.length; cursor++) {
      const item = body[cursor].match(/^(\s*)-\s*(.+?)\s*$/);
      if (!item) break;
      args.push(unquote(item[2]));
    }
  }

  const command = pick(/^\s*command:\s*(.+)$/m);
  return {
    id: block.id,
    name: pick(/^\s*serverName:\s*(.+)$/m) || block.id.replace(/^mcp-/, ''),
    transport: pick(/^\s*transport:\s*(.+)$/m) || 'stdio',
    /** `env` is deliberately not read: credentials never leave the file. */
    command: command || args[0] || '',
    args: command ? args : args.slice(1),
    disabled: body.some((line) => /^\s*disabled:\s*true\s*$/.test(line)),
  };
}

/** `{ servers }` for a patch document; re-read this per request to see new rows. */
export function readServers(text) {
  const doc = scanDocument(text);
  const servers = [];
  for (const block of findBlocks(doc.lines)) {
    const parsed = parseBlock(doc.lines, block);
    if (parsed) servers.push(parsed);
  }
  return { ...doc, servers };
}

/**
 * Set `disabled` on one row, leaving every other byte alone.
 *
 * Returns `{ ok, changed, text, error }`. `changed: false` means the file is
 * already in the requested state, so the caller can skip the write.
 */
export function setDisabled(text, id, disabled) {
  const doc = scanDocument(text);
  const block = findBlocks(doc.lines).find((candidate) => candidate.id === id);
  if (!block) return { ok: false, changed: false, text, error: `row not found: ${id}` };

  const body = doc.lines.slice(block.start, block.end);
  if (GROUP_RE.test(body.join('\n'))) {
    return { ok: false, changed: false, text, error: `group node, not a server: ${id}` };
  }
  if (!CLIENT_RE.test(body.join('\n'))) {
    return { ok: false, changed: false, text, error: `not an MCP client row: ${id}` };
  }

  const offset = body.findIndex((line) => DISABLED_ANY_RE.test(line));
  const absolute = offset >= 0 ? block.start + offset : -1;

  // A loader expression can span lines; rewriting its first line would corrupt
  // the document, so refuse instead of guessing.
  if (absolute >= 0 && !DISABLED_BOOL_RE.test(doc.lines[absolute])) {
    return {
      ok: false,
      changed: false,
      text,
      error: `disabled: on ${id} is a loader expression; edit it by hand`,
    };
  }

  if (disabled) {
    if (absolute >= 0) {
      if (/^\s*disabled:\s*true\s*$/.test(doc.lines[absolute])) {
        return { ok: true, changed: false, text };
      }
      doc.lines[absolute] = doc.lines[absolute].replace(/^(\s*disabled:\s*).*$/, '$1true');
      return { ok: true, changed: true, text: joinDocument(doc) };
    }
    const pad = ' '.repeat(block.indent + 2);
    doc.lines.splice(block.start + 1, 0, `${pad}disabled: true`);
    return { ok: true, changed: true, text: joinDocument(doc) };
  }

  if (absolute < 0) return { ok: true, changed: false, text };
  doc.lines.splice(absolute, 1);
  return { ok: true, changed: true, text: joinDocument(doc) };
}

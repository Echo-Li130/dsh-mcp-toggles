import test from 'node:test';
import assert from 'node:assert/strict';
import { findBlocks, readServers, scanDocument, setDisabled } from '../src/patch.mjs';

/**
 * A patch with the shape the plugin has to cope with in the wild: a group node
 * that holds a nested MCP row, a flat MCP row, and non-MCP rows in between.
 * Every path here is an example, never a real machine path.
 */
const PATCH = `# profile patch layer
- id: ui-theme
  name: "@deepseek-ai/dsh-client-ui-theme"
  config:
    preference: dark

- insert:
    - id: mcp-group
      name: cordis:group
      group: true
      config:
        - id: mcp-example
          name: '@deepseek-ai/dsh-mcp-client'
          config:
            transport: stdio
            serverName: example
            command: /opt/example/node
            args:
              - /opt/example/server.mjs
            env: {}
            cwd: ''

- id: mcp-remote
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    transport: streamable-http
    serverName: remote
    url: https://example.com/mcp
`;

const NESTED_LINE = '        - id: mcp-example\n';
const NESTED_DISABLED = '        - id: mcp-example\n          disabled: true\n';

test('scanDocument keeps the newline style, BOM and trailing newline', () => {
  const doc = scanDocument(PATCH);
  assert.equal(doc.eol, '\n');
  assert.equal(doc.bom, false);
  assert.equal(doc.trailingEol, true);
  assert.equal(doc.lines.length, PATCH.split('\n').length - 1);
});

test('findBlocks sees nested rows at any depth', () => {
  const ids = findBlocks(scanDocument(PATCH).lines).map((block) => block.id);
  assert.deepEqual(ids, ['mcp-group', 'mcp-example', 'mcp-remote']);
});

test('readServers skips group nodes and non-MCP rows', () => {
  const { servers } = readServers(PATCH);
  assert.deepEqual(servers.map((server) => server.id), ['mcp-example', 'mcp-remote']);
});

test('readServers parses the fields the settings page renders', () => {
  const [example, remote] = readServers(PATCH).servers;
  assert.deepEqual(example, {
    id: 'mcp-example',
    name: 'example',
    transport: 'stdio',
    command: '/opt/example/node',
    args: ['/opt/example/server.mjs'],
    disabled: false,
  });
  assert.equal(remote.name, 'remote');
  assert.equal(remote.transport, 'streamable-http');
  assert.equal(remote.command, '');
  assert.deepEqual(remote.args, []);
});

test('readServers never exposes env or credentials', () => {
  for (const server of readServers(PATCH).servers) {
    assert.equal('env' in server, false);
    assert.equal('url' in server, false);
  }
});

test('a commented-out row is not listed', () => {
  const text = '- id: mcp-real\n  transport: stdio\n# - id: mcp-commented\n';
  assert.deepEqual(readServers(text).servers.map((server) => server.id), ['mcp-real']);
});

test('disabling inserts one line with the row indent and changes nothing else', () => {
  const edit = setDisabled(PATCH, 'mcp-example', true);
  assert.equal(edit.ok, true);
  assert.equal(edit.changed, true);
  assert.equal(edit.text, PATCH.replace(NESTED_LINE, NESTED_DISABLED));
});

test('disabling twice is idempotent', () => {
  const once = setDisabled(PATCH, 'mcp-example', true);
  const twice = setDisabled(once.text, 'mcp-example', true);
  assert.equal(twice.ok, true);
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once.text);
});

test('enabling removes exactly the line that was inserted', () => {
  const disabled = setDisabled(PATCH, 'mcp-example', true).text;
  const enabled = setDisabled(disabled, 'mcp-example', false);
  assert.equal(enabled.changed, true);
  assert.equal(enabled.text, PATCH);
});

test('enabling an already enabled row is a no-op', () => {
  const edit = setDisabled(PATCH, 'mcp-example', false);
  assert.equal(edit.ok, true);
  assert.equal(edit.changed, false);
  assert.equal(edit.text, PATCH);
});

test('an explicit disabled: false is rewritten, not duplicated', () => {
  const text = '- id: mcp-a\n  disabled: false\n  serverName: a\n';
  const edit = setDisabled(text, 'mcp-a', true);
  assert.equal(edit.text, '- id: mcp-a\n  disabled: true\n  serverName: a\n');
  assert.equal(edit.text.split('disabled:').length - 1, 1);
});

test('an unknown row is reported, not created', () => {
  const edit = setDisabled(PATCH, 'mcp-missing', true);
  assert.equal(edit.ok, false);
  assert.match(edit.error, /row not found/);
  assert.equal(edit.text, PATCH);
});

test('a group node is refused', () => {
  const edit = setDisabled(PATCH, 'mcp-group', true);
  assert.equal(edit.ok, false);
  assert.match(edit.error, /group node/);
  assert.equal(edit.text, PATCH);
});

test('an expression-valued disabled line is refused instead of corrupted', () => {
  const text = '- id: mcp-expr\n  disabled: !!js "(() => true)()"\n  serverName: expr\n';
  const edit = setDisabled(text, 'mcp-expr', false);
  assert.equal(edit.ok, false);
  assert.match(edit.error, /loader expression/);
  assert.equal(edit.text, text);
});

test('CRLF files stay CRLF', () => {
  const crlf = PATCH.replace(/\n/g, '\r\n');
  const edit = setDisabled(crlf, 'mcp-example', true);
  assert.equal(edit.ok, true);
  assert.equal(edit.text, crlf.replace(NESTED_LINE.replace(/\n/g, '\r\n'), NESTED_DISABLED.replace(/\n/g, '\r\n')));
  assert.equal(/(?<!\r)\n/.test(edit.text), false);
});

test('a UTF-8 BOM survives an edit', () => {
  const edit = setDisabled('\uFEFF' + PATCH, 'mcp-example', true);
  assert.equal(edit.ok, true);
  assert.equal(edit.text.startsWith('\uFEFF'), true);
  assert.equal(edit.text, '\uFEFF' + PATCH.replace(NESTED_LINE, NESTED_DISABLED));
});

test('a file without a trailing newline gains none', () => {
  const text = PATCH.trimEnd();
  const edit = setDisabled(text, 'mcp-example', true);
  assert.equal(edit.ok, true);
  assert.equal(edit.text.endsWith('\n'), false);
});

test('a row appended later is picked up on the next read', () => {
  const appended = `${PATCH}
- id: mcp-probe
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    transport: stdio
    serverName: probe
    command: /opt/example/node
    args:
      - /opt/example/probe.mjs
`;
  assert.deepEqual(readServers(PATCH).servers.map((server) => server.id), ['mcp-example', 'mcp-remote']);
  assert.deepEqual(readServers(appended).servers.map((server) => server.id), [
    'mcp-example',
    'mcp-remote',
    'mcp-probe',
  ]);
  const disabled = setDisabled(appended, 'mcp-probe', true);
  assert.equal(disabled.ok, true);
  assert.equal(readServers(disabled.text).servers.at(-1).disabled, true);
});

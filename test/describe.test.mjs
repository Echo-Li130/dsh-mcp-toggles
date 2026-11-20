import test from 'node:test';
import assert from 'node:assert/strict';
import { describeServer, readDescriptions, summarizeTools } from '../src/describe.mjs';

test('readDescriptions keeps only non-empty string entries and lowercases keys', () => {
  const table = readDescriptions({
    descriptions: {
      Example: '  示例服务器的说明  ',
      remote: '',
      broken: 42,
      '': 'ignored',
    },
  });
  assert.equal(table.example, '示例服务器的说明');
  assert.equal('remote' in table, false);
  assert.equal('broken' in table, false);
});

test('readDescriptions tolerates a missing or malformed config', () => {
  for (const config of [undefined, null, {}, { descriptions: null }, { descriptions: [] }, { descriptions: 'text' }]) {
    const table = readDescriptions(config);
    assert.equal(Object.keys(table).length, 0);
  }
});

test('readDescriptions cannot pollute Object.prototype', () => {
  const table = readDescriptions(JSON.parse('{"descriptions":{"__proto__":"x"}}'));
  assert.equal(Object.getPrototypeOf(table), null);
  assert.equal(({}).x, undefined);
});

test('describeServer matches the serverName first, then the row id', () => {
  const table = readDescriptions({
    descriptions: {
      example: '按 serverName',
      'mcp-other': '按行 id',
    },
  });
  assert.equal(describeServer({ id: 'mcp-example', name: 'Example' }, table), '按 serverName');
  assert.equal(describeServer({ id: 'mcp-other', name: 'other' }, table), '按行 id');
  assert.equal(describeServer({ id: 'mcp-unknown', name: 'unknown' }, table), '');
  assert.equal(describeServer(null, table), '');
  assert.equal(describeServer({ id: 'mcp-example', name: 'Example' }, undefined), '');
});

test('summarizeTools counts only the named server tools and caps the names', () => {
  const definitions = [
    { name: 'mcp__example__open' },
    { name: 'mcp__example__close' },
    { name: 'mcp__other__open' },
    { name: 'read_file' },
    { name: 'mcp__example__status' },
    { name: 'mcp__example__submit' },
    { name: 'mcp__example__redo' },
    { name: 'mcp__example__collect' },
  ];
  const summary = summarizeTools(definitions, 'example');
  assert.equal(summary.count, 6);
  assert.deepEqual(summary.names, ['open', 'close', 'status', 'submit', 'redo']);
});

test('summarizeTools degrades to an empty summary', () => {
  assert.deepEqual(summarizeTools(undefined, 'example'), { count: 0, names: [] });
  assert.deepEqual(summarizeTools([], 'example'), { count: 0, names: [] });
  assert.deepEqual(summarizeTools([{ name: 'mcp__example__' }], 'example'), { count: 0, names: [] });
});

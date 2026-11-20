import test from 'node:test';
import assert from 'node:assert/strict';

/** The browser bundle registers its factory through this global; capture it. */
let spec;
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      spec = value;
    },
  },
};
await import('../client.js');

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children };
  },
};

function loadPlugin() {
  return spec.factory((id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected require: ${id}`);
  });
}

/**
 * A client context just wide enough for this plugin: locale dictionaries,
 * declaration-aware slot injection, and effects that run once.
 */
function fakeContext({ withInject = true } = {}) {
  const registered = [];
  const dictionaries = {};
  const ctx = {
    effect(fn) {
      const off = fn();
      return typeof off === 'function' ? off : undefined;
    },
    locale: {
      register(ns, dict) {
        dictionaries[ns] = dict;
        return () => {};
      },
      bind(ns) {
        return (key, params) => {
          const dict = dictionaries[ns] || {};
          const template = (dict.zh && dict.zh[key]) || key;
          if (!params) return template;
          return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
        };
      },
      subscribe() {
        return () => {};
      },
    },
    slots: {
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };
  if (withInject) {
    ctx.slots.inject = (_name, register) => {
      register();
      return () => {};
    };
  }
  return { ctx, registered };
}

test('the client factory declares the locale and slot services', () => {
  const plugin = loadPlugin();
  assert.equal(spec.id, 'dsh-mcp-toggles');
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
});

test('the sidebar entry sits between Plugins (0) and Automation tasks (10)', () => {
  const plugin = loadPlugin();
  const { ctx, registered } = fakeContext();
  plugin.apply(ctx);

  const row = registered.find((entry) => entry.options.name === 'sidebar.panellist');
  assert.ok(row, 'a sidebar.panellist registration exists');
  assert.equal(row.options.id, 'mcp-toggles');
  assert.equal(row.options.order, 5);
  assert.ok(row.options.order > 0 && row.options.order < 10, 'order falls between the two official panels');
  assert.equal(row.options.label(), 'MCP 连接器');

  const main = registered.find((entry) => entry.options.name === 'main');
  assert.ok(main, 'the main panel registration exists');
  assert.equal(main.options.key, 'mcp-toggles');
  assert.equal(typeof main.component, 'function');
});

test('the old Settings contributions are gone', () => {
  const plugin = loadPlugin();
  const { ctx, registered } = fakeContext();
  plugin.apply(ctx);
  assert.equal(registered.some((entry) => String(entry.options.name).startsWith('settings.')), false);
});

test('the sidebar icon renders a monochrome glyph at the requested size', () => {
  const plugin = loadPlugin();
  const { ctx, registered } = fakeContext();
  plugin.apply(ctx);
  const row = registered.find((entry) => entry.options.name === 'sidebar.panellist');
  const tree = row.component({ size: 18, active: true, id: 'mcp-toggles' });
  assert.equal(tree.type, 'svg');
  assert.equal(tree.props.width, 18);
  assert.equal(tree.props.height, 18);
  assert.equal(tree.props.stroke, 'currentColor');
});

test('registration also works when the host offers no declaration-aware inject', () => {
  const plugin = loadPlugin();
  const { ctx, registered } = fakeContext({ withInject: false });
  plugin.apply(ctx);
  assert.equal(registered.filter((entry) => entry.options.name === 'sidebar.panellist').length, 1);
  assert.equal(registered.filter((entry) => entry.options.name === 'main').length, 1);
});

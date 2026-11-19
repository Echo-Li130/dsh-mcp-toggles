/**
 * dsh-mcp-toggles — browser half.
 *
 * Adds one page to Settings ("MCP connector toggles"): every `mcp-*` loader row
 * of the profile patch, each with an on/off switch.
 *
 * React comes from the page's module table; styles are inline and use only the
 * host's `--dsw-alias-*` tokens, so no Harness client package is required at
 * runtime. All visible text goes through the client locale service.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-toggles',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'mcpToggles';
    const API = { list: '/api/mcp-toggles/servers', toggle: '/api/mcp-toggles/toggle' };

    const DICT = {
      zh: {
        nav: 'MCP 连接器',
        heading: 'MCP 连接器',
        refresh: '刷新',
        loading: '加载中…',
        empty: '没有解析到 MCP 连接器。',
        columnConnector: '连接器',
        columnTransport: '传输',
        columnCommand: '启动命令',
        columnSwitch: '开关',
        enabled: '已启用',
        disabled: '已停用',
        lastFile: '受管文件',
        hint: '开关只改这一行 MCP 服务器在 profile 补丁里的挂载状态：停用时插入一行 disabled: true，启用时把那行删掉，文件其余内容逐字节不动。改动经热重载约 2 秒生效，停用后该服务器的工具会从模型工具列表消失。',
        scope: '只列出写在这个文件里的 - id: mcp-* 行。mcp-manager 的 servers 映射、其他插件 bundle 自带的补丁层都不在此列。',
        loadFailed: '读取失败',
        toggleFailed: '切换失败',
        disabledNote: '已停用 {name}，约 2 秒生效',
        enabledNote: '已启用 {name}，约 2 秒生效',
      },
      en: {
        nav: 'MCP connector toggles',
        heading: 'MCP connector toggles',
        refresh: 'Refresh',
        loading: 'Loading…',
        empty: 'No MCP connectors were found.',
        columnConnector: 'Connector',
        columnTransport: 'Transport',
        columnCommand: 'Command',
        columnSwitch: 'Switch',
        enabled: 'On',
        disabled: 'Off',
        lastFile: 'Managed file',
        hint: 'A switch changes only how this MCP server is mounted in your profile patch: turning it off inserts one disabled: true line, turning it back on removes that line, and every other byte of the file stays untouched. The change applies through hot reload in about two seconds, and a disabled server\u2019s tools leave the model\u2019s tool list.',
        scope: 'Only - id: mcp-* rows written in that one file are listed. mcp-manager\u2019s servers map and patch layers shipped by other bundles are not included.',
        loadFailed: 'Could not load',
        toggleFailed: 'Could not switch',
        disabledNote: '{name} turned off; applies in about two seconds',
        enabledNote: '{name} turned on; applies in about two seconds',
      },
    };

    const style = {
      page: { padding: '4px 2px 24px', fontFamily: 'inherit', color: 'var(--dsw-alias-text-primary, #e6e8ee)' },
      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
      heading: { fontSize: 15, fontWeight: 600, margin: 0 },
      button: {
        border: '1px solid var(--dsw-alias-border-secondary, #3a4150)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
      },
      hint: { fontSize: 12, lineHeight: 1.8, color: 'var(--dsw-alias-text-secondary, #8b93a7)', marginBottom: 10 },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
      th: {
        textAlign: 'left',
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--dsw-alias-text-secondary, #8b93a7)',
        borderBottom: '1px solid var(--dsw-alias-border-secondary, #262a33)',
      },
      td: {
        padding: '10px',
        verticalAlign: 'top',
        borderBottom: '1px solid var(--dsw-alias-border-secondary, #262a33)',
      },
      mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, wordBreak: 'break-all' },
      dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6 },
      switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' },
      track: (on) => ({
        width: 38,
        height: 20,
        borderRadius: 999,
        background: on ? 'var(--dsw-alias-state-success-primary, #2ecc71)' : 'var(--dsw-alias-border-secondary, #3a4150)',
        position: 'relative',
        transition: 'background .15s ease',
        flex: '0 0 auto',
      }),
      knob: (on) => ({
        position: 'absolute',
        top: 2,
        left: on ? 20 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left .15s ease',
      }),
      err: {
        margin: '10px 0',
        padding: '8px 10px',
        borderRadius: 6,
        fontSize: 12,
        background: 'rgba(255,92,92,.12)',
        color: 'var(--dsw-alias-state-error-primary, #ff5c5c)',
      },
      empty: { padding: '16px 4px', color: 'var(--dsw-alias-text-secondary, #8b93a7)', fontSize: 13 },
    };

    function format(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (whole, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
      );
    }

    function Switch({ on, busy, label, onChange }) {
      return h(
        'span',
        {
          style: { ...style.switchWrap, opacity: busy ? 0.6 : 1 },
          role: 'switch',
          'aria-checked': on ? 'true' : 'false',
          'aria-label': label,
          tabIndex: 0,
          onClick: () => {
            if (!busy) onChange(!on);
          },
          onKeyDown: (event) => {
            if (busy) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onChange(!on);
            }
          },
        },
        h('span', { style: style.track(on) }, h('span', { style: style.knob(on) })),
        h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-text-secondary, #8b93a7)' } }, label),
      );
    }

    function McpTogglesPage({ ctx, t }) {
      const [state, setState] = React.useState({ loading: true, servers: [], configPath: '', error: '' });
      const [busy, setBusy] = React.useState({});
      const [note, setNote] = React.useState('');
      const [, bump] = React.useState(0);

      // Re-render on a language change: `t` is stable, so React cannot see it.
      React.useEffect(() => {
        if (!ctx || !ctx.locale || typeof ctx.locale.subscribe !== 'function') return undefined;
        const off = ctx.locale.subscribe(() => bump((value) => value + 1));
        return typeof off === 'function' ? off : undefined;
      }, []);

      const load = React.useCallback(async () => {
        try {
          const res = await fetch(API.list, { cache: 'no-store' });
          const body = await res.json();
          if (!body.ok) throw new Error(body.error || t('loadFailed'));
          setState({ loading: false, servers: body.servers || [], configPath: body.configPath || '', error: '' });
        } catch (error) {
          setState((current) => ({ ...current, loading: false, error: String((error && error.message) || error) }));
        }
      }, []);

      React.useEffect(() => {
        load();

        let timer = 0;
        const stop = () => {
          if (timer) clearInterval(timer);
          timer = 0;
        };
        const start = () => {
          stop();
          timer = setInterval(() => {
            if (!document.hidden) load();
          }, 10000);
        };
        const onWake = () => {
          if (!document.hidden) load();
        };

        start();
        window.addEventListener('focus', onWake);
        document.addEventListener('visibilitychange', onWake);
        return () => {
          stop();
          window.removeEventListener('focus', onWake);
          document.removeEventListener('visibilitychange', onWake);
        };
      }, [load]);

      const toggle = async (server, nextDisabled) => {
        setBusy((current) => ({ ...current, [server.id]: true }));
        setNote('');
        setState((current) => ({
          ...current,
          servers: current.servers.map((row) => (row.id === server.id ? { ...row, disabled: nextDisabled } : row)),
        }));
        try {
          const res = await fetch(API.toggle, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: server.id, disabled: nextDisabled }),
          });
          const body = await res.json();
          if (!body.ok) throw new Error(body.error || t('toggleFailed'));
          setNote(format(t(nextDisabled ? 'disabledNote' : 'enabledNote'), { name: server.name }));
          await load();
        } catch (error) {
          setState((current) => ({
            ...current,
            servers: current.servers.map((row) => (row.id === server.id ? { ...row, disabled: !nextDisabled } : row)),
            error: String((error && error.message) || error),
          }));
        } finally {
          setBusy((current) => ({ ...current, [server.id]: false }));
        }
      };

      return h(
        'div',
        { style: style.page },
        h(
          'div',
          { style: style.header },
          h('h2', { style: style.heading }, t('heading')),
          h('button', { type: 'button', style: style.button, onClick: load }, t('refresh')),
        ),
        h('div', { style: style.hint }, t('hint')),
        h('div', { style: style.hint }, t('scope')),
        state.configPath
          ? h(
              'div',
              { style: { ...style.mono, color: 'var(--dsw-alias-text-secondary, #8b93a7)', marginBottom: 12 } },
              t('lastFile') + ': ' + state.configPath,
            )
          : null,
        state.error ? h('div', { style: style.err }, state.error) : null,
        note ? h('div', { style: { ...style.hint, marginBottom: 8 } }, note) : null,
        state.loading
          ? h('div', { style: style.empty }, t('loading'))
          : state.servers.length === 0
            ? h('div', { style: style.empty }, t('empty'))
            : h(
                'table',
                { style: style.table },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', { style: { ...style.th, width: 160 } }, t('columnConnector')),
                    h('th', { style: { ...style.th, width: 80 } }, t('columnTransport')),
                    h('th', { style: style.th }, t('columnCommand')),
                    h('th', { style: { ...style.th, width: 120 } }, t('columnSwitch')),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  state.servers.map((server) =>
                    h(
                      'tr',
                      { key: server.id },
                      h(
                        'td',
                        { style: style.td },
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                          h('span', {
                            style: {
                              ...style.dot,
                              background: server.disabled
                                ? 'var(--dsw-alias-text-secondary, #6b7280)'
                                : 'var(--dsw-alias-state-success-primary, #2ecc71)',
                            },
                          }),
                          h('strong', null, server.name),
                        ),
                        h(
                          'div',
                          { style: { ...style.mono, color: 'var(--dsw-alias-text-secondary, #8b93a7)' } },
                          server.id,
                        ),
                      ),
                      h('td', { style: { ...style.td, whiteSpace: 'nowrap' } }, h('code', null, server.transport)),
                      h(
                        'td',
                        { style: { ...style.td, ...style.mono } },
                        [server.command].concat(server.args || []).filter(Boolean).join(' '),
                      ),
                      h(
                        'td',
                        { style: style.td },
                        h(Switch, {
                          on: !server.disabled,
                          busy: !!busy[server.id],
                          label: server.disabled ? t('disabled') : t('enabled'),
                          onChange: (nextOn) => toggle(server, !nextOn),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
      );
    }

    function McpTogglesIcon({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 2, y: 7, width: 20, height: 10, rx: 5, fill: '#3d7dfa' }),
        h('circle', { cx: 16, cy: 12, r: 3.6, fill: '#fff' }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'mcp-toggles: dictionaries');

        const t = ctx.locale.bind(NS);
        const contribute = (slotName, options, component) => {
          const register = () => ctx.slots.register({ name: slotName, ...options }, component);
          // `inject` installs the registration when the owning declaration
          // exists and reinstalls it if the host re-declares the slot.
          if (typeof ctx.slots.inject === 'function') ctx.slots.inject(slotName, register);
          else register();
        };

        contribute(
          'settings.section',
          { id: 'mcp-toggles', order: 41, label: () => t('nav'), locale: NS, inject: () => ({ ctx, t }) },
          McpTogglesPage,
        );

        contribute('settings.section.icon', { id: 'mcp-toggles' }, (owner = {}) =>
          h(McpTogglesIcon, { size: owner.size == null ? 16 : owner.size }),
        );
      },
    };
  },
});

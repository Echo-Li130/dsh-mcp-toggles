/**
 * dsh-mcp-toggles — browser half.
 *
 * Adds one global panel ("MCP connector toggles") to the sidebar, directly
 * between Plugins and Automation tasks, and the page it opens: every `mcp-*`
 * loader row of the profile patch, each with a one-line introduction (from the
 * plugin's `config.descriptions`) and an on/off switch.
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
    const PANEL_ID = 'mcp-toggles';
    const API = { list: '/api/mcp-toggles/servers', toggle: '/api/mcp-toggles/toggle' };

    const DICT = {
      zh: {
        nav: 'MCP 连接器',
        heading: 'MCP 连接器',
        pageIntro: '管理当前 profile 里的 MCP 服务器。开关只改对应 loader 行的 disabled 字段，文件其余内容逐字节不动，改动约 2 秒后热重载生效。',
        refresh: '刷新',
        loading: '加载中…',
        empty: '没有解析到 MCP 连接器。',
        scope: '只列出写在受管文件里的 - id: mcp-* 行；mcp-manager 的 servers 映射与其他补丁层不在此列。',
        lastFile: '受管文件',
        loadFailed: '读取失败',
        toggleFailed: '切换失败',
        enabled: '已启用',
        disabled: '已停用',
        disabledNote: '已停用 {name}，约 2 秒生效',
        enabledNote: '已启用 {name}，约 2 秒生效',
        toolsCount: '{count} 个工具',
        noTools: '暂无工具（未连接或启动中）',
        unknownIntro: '外部 MCP 服务器「{name}」：通过 {transport} 连接。可在 profile 补丁里为它补一句中文简介。',
      },
      en: {
        nav: 'MCP connector toggles',
        heading: 'MCP connector toggles',
        pageIntro: 'Manage the MCP servers of this profile. A switch changes only that row\u2019s disabled field; every other byte of the file stays untouched, and the change applies through hot reload in about two seconds.',
        refresh: 'Refresh',
        loading: 'Loading…',
        empty: 'No MCP connectors were found.',
        scope: 'Only - id: mcp-* rows written in the managed file are listed. mcp-manager\u2019s servers map and patch layers shipped by other bundles are not included.',
        lastFile: 'Managed file',
        loadFailed: 'Could not load',
        toggleFailed: 'Could not switch',
        enabled: 'On',
        disabled: 'Off',
        disabledNote: '{name} turned off; applies in about two seconds',
        enabledNote: '{name} turned on; applies in about two seconds',
        toolsCount: '{count} tools',
        noTools: 'No tools yet (connecting or starting)',
        unknownIntro: 'External MCP server "{name}" over {transport}. Add a one-line intro for it in the profile patch.',
      },
    };

    const MONO = 'ui-monospace, Consolas, monospace';
    const style = {
      page: {
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-primary, #e6e8ee)',
        // Matches the host's entry pages: the top strip stays clear of window chrome.
        padding: 'calc(28px + var(--dsh-frame-top-clearance, 0px)) clamp(20px, 4vw, 48px) 48px',
      },
      inner: { width: '100%', maxWidth: 960, margin: '0 auto', boxSizing: 'border-box' },
      head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 },
      title: { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: '28px' },
      intro: { margin: '4px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary, #8b93a7)' },
      button: {
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-border-l2, #3a4150)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: 6,
        padding: '5px 12px',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
      },
      fileLine: {
        margin: '18px 0 0',
        fontFamily: MONO,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary, #8b93a7)',
        wordBreak: 'break-all',
      },
      scope: { margin: '4px 0 18px', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #8b93a7)' },
      list: { display: 'flex', flexDirection: 'column', gap: 10 },
      card: (off) => ({
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2, #2a2f3a)',
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.03))',
        opacity: off ? 0.66 : 1,
      }),
      cardMain: { flex: 1, minWidth: 0 },
      nameRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' },
      dot: (off) => ({
        width: 8,
        height: 8,
        borderRadius: '50%',
        flex: '0 0 auto',
        background: off
          ? 'var(--dsw-alias-label-tertiary, #6b7280)'
          : 'var(--dsw-alias-state-success-primary, #2ecc71)',
      }),
      name: { fontSize: 14, fontWeight: 600, lineHeight: '20px' },
      id: { fontFamily: MONO, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #8b93a7)' },
      desc: { margin: '6px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary, #8b93a7)' },
      meta: { margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #8b93a7)' },
      switchWrap: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
        flex: '0 0 auto',
        cursor: 'pointer',
        userSelect: 'none',
      },
      track: (on) => ({
        width: 38,
        height: 20,
        borderRadius: 999,
        background: on
          ? 'var(--dsw-alias-state-success-primary, #2ecc71)'
          : 'var(--dsw-alias-border-l3, #3a4150)',
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
        margin: '12px 0 0',
        padding: '8px 10px',
        borderRadius: 6,
        fontSize: 12,
        lineHeight: '18px',
        background: 'rgba(255,92,92,.12)',
        color: 'var(--dsw-alias-state-error-primary, #ff5c5c)',
      },
      note: { margin: '12px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #8b93a7)' },
      empty: { padding: '18px 4px', color: 'var(--dsw-alias-label-secondary, #8b93a7)', fontSize: 13 },
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
        h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8b93a7)' } }, label),
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
          setState({
            loading: false,
            servers: Array.isArray(body.servers) ? body.servers : [],
            configPath: body.configPath || '',
            error: '',
          });
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

      const card = (server) => {
        const off = server.disabled === true;
        const tools = server.tools && typeof server.tools === 'object' ? server.tools : { count: 0 };
        const intro = server.description
          ? server.description
          : format(t('unknownIntro'), { name: server.name, transport: server.transport || 'stdio' });
        const toolText = typeof tools.count === 'number' && tools.count > 0
          ? format(t('toolsCount'), { count: tools.count })
          : t('noTools');
        const meta = [server.transport || 'stdio', off ? t('disabled') : toolText].join(' · ');
        return h(
          'div',
          { key: server.id, style: style.card(off) },
          h(
            'div',
            { style: style.cardMain },
            h(
              'div',
              { style: style.nameRow },
              h('span', { style: style.dot(off), 'aria-hidden': true }),
              h('span', { style: style.name }, server.name),
              h('span', { style: style.id }, server.id),
            ),
            h('div', { style: style.desc }, intro),
            h('div', { style: style.meta }, meta),
          ),
          h(Switch, {
            on: !off,
            busy: !!busy[server.id],
            label: off ? t('disabled') : t('enabled'),
            onChange: (nextOn) => toggle(server, !nextOn),
          }),
        );
      };

      return h(
        'div',
        { style: style.page },
        h(
          'div',
          { style: style.inner },
          h(
            'div',
            { style: style.head },
            h(
              'div',
              { style: { minWidth: 0 } },
              h('h1', { style: style.title }, t('heading')),
              h('p', { style: style.intro }, t('pageIntro')),
            ),
            h('button', { type: 'button', style: style.button, onClick: load }, t('refresh')),
          ),
          state.configPath
            ? h('div', { style: style.fileLine }, t('lastFile') + ': ' + state.configPath)
            : null,
          h('div', { style: style.scope }, t('scope')),
          state.error ? h('div', { style: style.err }, state.error) : null,
          note ? h('div', { style: style.note }, note) : null,
          state.loading
            ? h('div', { style: style.empty }, t('loading'))
            : state.servers.length === 0
              ? h('div', { style: style.empty }, t('empty'))
              : h('div', { style: style.list }, state.servers.map(card)),
        ),
      );
    }

    /** Monochrome plug glyph: the sidebar owns the row, label, and selected state. */
    function McpTogglesIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('rect', { x: 2.4, y: 5.2, width: 6.8, height: 5.6, rx: 1.6 }),
        h('path', { d: 'M9.2 8h2.2a1.8 1.8 0 0 0 0-3.6h-1.6' }),
        h('path', { d: 'M4.5 5.2V3.4' }),
        h('path', { d: 'M7.1 5.2V3.4' }),
        h('path', { d: 'M5.8 10.8V12a1.4 1.4 0 0 0 1.4 1.4h2' }),
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

        // The page is a global panel: it belongs to the profile, not a Session.
        contribute(
          'main',
          { key: PANEL_ID, locale: NS, inject: () => ({ ctx, t }) },
          McpTogglesPage,
        );

        // order 5 sits between Plugins (0) and Automation tasks (10).
        contribute(
          'sidebar.panellist',
          { id: PANEL_ID, order: 5, label: () => t('nav'), locale: NS },
          McpTogglesIcon,
        );
      },
    };
  },
});

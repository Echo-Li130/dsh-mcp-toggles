# For agents installing this plugin

`dsh-mcp-toggles` is a DeepSeek Harness bundle: a Host half (`index.js`) that
registers three HTTP routes, and a Client half (`client.js`) that adds one global
panel to the left sidebar (between Plugins and Automation tasks). It has no
dependencies and no build step.

## Install

```
plugin_manager({ action: "install_bundle", target: "/absolute/path/to/dsh-mcp-toggles" })
```

Or from the UI: **Plugins → Add plugin → pick the directory**. Then reload the
page; the entry appears in the left sidebar as **MCP connector toggles**.

## Verify

1. `GET http://127.0.0.1:<port>/api/mcp-toggles/servers` returns `{ ok: true, configPath, servers: [...] }`.
2. `GET http://127.0.0.1:<port>/mcp-toggles` returns the fallback page.
3. Toggle one row off and on again through `POST /api/mcp-toggles/toggle`; the
   server's tools should leave and rejoin the model's tool list, and the
   `cordis.patch.yml` file should be byte-identical to before afterwards.

Do not claim the sidebar panel or its intros render correctly without a human confirming it;
slot registration alone does not prove what the user sees.

## Intros

A server's one-line intro comes from this plugin's own loader row:
`config.descriptions[serverName]` in the profile patch. The API returns it as
`servers[].description` plus `servers[].tools` (count and up to five raw tool
names read from `ctx.tools`). A missing entry is a generic line, never an error.

## Pitfalls

- **The client loader id must equal the package name.** `client.js` declares
  `id: 'dsh-mcp-toggles'`; renaming the package without renaming that string
  makes the page silently disappear. `scripts/validate.mjs` checks this.
- **Reinstalling under a new name needs the old bundle removed first.** Otherwise
  the previous row points at a package that no longer exists.
- **Rows may be nested.** In real profiles an `mcp-*` row can sit inside a
  `cordis:group` node's `config:` list. The scanner walks every line, but a group
  node itself is never listed and never toggled.
- **Never rewrite a `disabled:` expression.** A `!!js` value can span lines;
  rewriting its first line corrupts the document. The plugin refuses instead.
- **Preserve the file's exact bytes.** CRLF/LF, a UTF-8 BOM and the trailing
  newline must survive; the tests in `test/patch.test.mjs` enforce it.
- **Only one file is managed.** If a server is missing from the list, check
  whether its row lives in another patch layer or uses an id without the `mcp-`
  prefix. Do not "fix" it by editing the wrong file.

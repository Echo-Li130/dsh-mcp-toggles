/**
 * Release checks: the manifest, the files it claims to ship, the localized
 * metadata, the detail documents and their artwork.
 *
 * Zero dependencies on purpose — this runs from `npm test`, from CI and from
 * the `prepack` hook, so a broken release never reaches `npm pack`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function check(ok, message) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) problems.push(message);
}

const abs = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');
const exists = (rel) => fs.existsSync(abs(rel));

/* ── manifest ─────────────────────────────────────────────────────────── */

const pkg = JSON.parse(read('package.json'));
check(typeof pkg.name === 'string' && pkg.name.length > 0, 'package.json has a name');
check(/^\d+\.\d+\.\d+/.test(String(pkg.version)), 'package.json has a semver version');
check(typeof pkg.description === 'string' && pkg.description.length > 40, 'package.json has a description');
check(pkg.license === 'MIT', 'package.json declares the MIT license');
check(!Object.prototype.hasOwnProperty.call(pkg, 'private'), 'package.json is publishable (no "private")');
check(pkg.type === 'module', 'package.json is an ES module package');
check(Boolean(pkg.repository && pkg.repository.url), 'package.json has a repository URL');
check(Boolean(pkg.engines && pkg.engines.dsh), 'package.json declares engines.dsh');
check(Boolean(pkg.engines && pkg.engines.node), 'package.json declares engines.node');
check(!pkg.author, 'package.json carries no author identity');

const patchPath = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
check(typeof patchPath === 'string' && exists(patchPath), `bundle patch exists: ${patchPath}`);
const patchText = read(patchPath);
check(/id:\s*mcp-toggles/.test(patchText), 'bundle patch inserts the mcp-toggles row');
check(patchText.includes(`'${pkg.name}'`), 'bundle patch names the package');

const client = pkg.dsh && pkg.dsh.client;
check(Boolean(client), 'package.json declares dsh.client');
check(client && client.platform === 'web', 'the client half targets the web platform');
check(Array.isArray(client && client.inject) && client.inject.length > 0, 'dsh.client.inject is declared');

/* ── exports and shipped files ────────────────────────────────────────── */

for (const key of ['.', './client', './locale/*.json', './icon', './cordis.patch.yml']) {
  check(Boolean(pkg.exports && pkg.exports[key]), `exports ${key}`);
}

function expand(entry) {
  if (!entry.includes('*')) return exists(entry) ? [entry] : [];
  const dir = path.dirname(entry);
  const pattern = new RegExp(
    '^' +
      path
        .basename(entry)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/\\\\]*') +
      '$',
  );
  try {
    return fs
      .readdirSync(abs(dir))
      .filter((name) => pattern.test(name))
      .map((name) => (dir === '.' ? name : `${dir}/${name}`));
  } catch {
    return [];
  }
}

check(Array.isArray(pkg.files) && pkg.files.length > 0, 'package.json lists files');
for (const entry of pkg.files || []) {
  check(expand(entry).length > 0, `files entry resolves: ${entry}`);
}

for (const runtime of ['index.js', 'client.js', 'src/patch.mjs', 'src/profile.mjs', 'src/routes.mjs', 'public/panel.html']) {
  check(exists(runtime), `runtime file exists: ${runtime}`);
}

/* ── localized metadata and detail documents ──────────────────────────── */

function checkDetail(locale) {
  const rel = `locale/${locale}.json`;
  if (!exists(rel)) {
    check(false, `${rel} exists`);
    return;
  }
  let dict;
  try {
    dict = JSON.parse(read(rel));
  } catch (error) {
    check(false, `${rel} is valid JSON (${error.message})`);
    return;
  }
  const meta = dict.meta || {};
  check(typeof meta.title === 'string' && meta.title.length > 0, `${rel} has meta.title`);
  check(typeof meta.description === 'string' && meta.description.length > 80, `${rel} has a full meta.description`);
  check(typeof meta.detail === 'string' && meta.detail.endsWith('.md'), `${rel} has meta.detail`);

  if (typeof meta.detail !== 'string') return;
  check(exists(meta.detail), `${rel} detail target exists: ${meta.detail}`);
  if (!exists(meta.detail)) return;

  const imageLine = read(meta.detail)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  check(imageLine.length === 1, `${meta.detail} holds exactly one line`);
  const match = (imageLine[0] || '').match(/^!\[[^\]]+\]\(([^)]+)\)$/);
  check(Boolean(match), `${meta.detail} is a single image reference`);
  if (!match) return;

  const image = path.posix.join(path.posix.dirname(meta.detail), match[1]);
  check(exists(image), `${meta.detail} image exists: ${image}`);
  if (exists(image)) checkSvg(image, true);
}

/* ── artwork ──────────────────────────────────────────────────────────── */

function checkSvg(rel, expectCanvas) {
  const text = read(rel);
  check(text.trimStart().startsWith('<svg'), `${rel} is an SVG`);
  check(!/<text[\s>]/i.test(text), `${rel} contains no text element`);
  check(!/<script[\s>]/i.test(text), `${rel} contains no script`);
  check(!/<foreignObject[\s>]/i.test(text), `${rel} contains no foreignObject`);
  // The SVG namespace declarations are the one allowed absolute URL.
  check(!/https?:\/\//i.test(text.replace(/xmlns(:\w+)?="[^"]*"/gi, '')), `${rel} references nothing remote`);
  if (expectCanvas) {
    check(
      /width="640"/.test(text) && /height="300"/.test(text) && /viewBox="0 0 640 300"/.test(text),
      `${rel} uses the 640x300 canvas`,
    );
  }
  check(fs.statSync(abs(rel)).size <= 256 * 1024, `${rel} is under 256 KiB`);
}

checkDetail('en');
checkDetail('zh');

check(exists('icon.svg'), 'icon.svg exists');
if (exists('icon.svg')) checkSvg('icon.svg', false);

const previews = fs.readdirSync(abs('docs')).filter((name) => /^preview.*\.svg$/.test(name));
const previewBytes = previews.reduce((sum, name) => sum + fs.statSync(abs(path.join('docs', name))).size, 0);
check(previews.length > 0, 'docs holds at least one preview image');
check(previewBytes <= 1024 * 1024, 'preview images stay under 1 MiB in total');

/* ── client module identity ───────────────────────────────────────────── */

const clientSource = read('client.js');
check(clientSource.includes('__ModuleLoader__.load'), 'client.js registers through the module loader');
const idMatch = clientSource.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*'([^']+)'/);
check(Boolean(idMatch), 'client.js declares a loader id');
check(Boolean(idMatch) && idMatch[1] === pkg.name, `client.js id equals the package name (${pkg.name})`);

/* ── nothing binary sneaks in ─────────────────────────────────────────── */

const SKIP_DIRS = new Set(['.git', 'node_modules', '.tools', '.profiles']);
const FORBIDDEN = /\.(png|jpe?g|webp|gif|ico|zip|tgz|tar|gz|bak|webm|mp4|woff2?)$/i;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/');
    if (FORBIDDEN.test(rel)) check(false, `binary or build artifact in the tree: ${rel}`);
  }
}
walk(ROOT);

/* ── result ───────────────────────────────────────────────────────────── */

if (problems.length > 0) {
  console.error(`\n${problems.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nall checks passed.');

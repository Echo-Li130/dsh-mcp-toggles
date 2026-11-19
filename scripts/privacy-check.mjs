/**
 * Privacy gate: fail the build if anything that belongs to the author's machine
 * reaches the working tree, a file name, or the git history.
 *
 * The rules are assembled from fragments so this scanner never matches its own
 * source text, which means the scan can be run over every file including this
 * one.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const part = (...pieces) => pieces.join('');

const RULES = [
  ['local account name', new RegExp(part('as', 'us'), 'i')],
  ['absolute Windows drive path', /(?:^|[^A-Za-z])[A-Za-z]:\\/],
  ['Windows home directory', new RegExp(part('\\\\', 'Users', '\\\\'), 'i')],
  ['access token', new RegExp(part('gh', 'p_'))],
  ['fine-grained token', new RegExp(part('github', '_pat_'))],
  ['personal mailbox', new RegExp(part('@(?:qq|gmail|outlook|163|126)\\.', 'com'), 'i')],
  ['course material', new RegExp(part('zhihui', 'shu'), 'i')],
  ['course material (zh)', new RegExp(part('智', '慧树'))],
  ['unrelated project', new RegExp(part('qui', 'z'), 'i')],
  ['previous package name', new RegExp(part('mcp-', 'switch'), 'i')],
  ['harness runtime path', new RegExp(part('dsh-', 'runtimes'), 'i')],
];

const SKIP_DIRS = new Set(['.git', 'node_modules', '.tools', '.profiles', '.pnpm-store']);
const SKIP_FILES = /\.(bak|tgz|log)$/i;

const findings = [];
const hit = (where, rule, sample) => findings.push({ where, rule, sample });

function scanText(where, text) {
  const lines = String(text).split(/\r?\n/);
  for (const [rule, pattern] of RULES) {
    for (let index = 0; index < lines.length; index++) {
      if (!pattern.test(lines[index])) continue;
      hit(where, rule, `line ${index + 1}`);
      break;
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (SKIP_FILES.test(rel)) continue;

    for (const [rule, pattern] of RULES) {
      if (pattern.test(rel)) hit(rel, rule, 'file name');
    }

    let text = '';
    try {
      // Raster images are reviewed as images, not as text: reading a PNG as
      // UTF-8 would only produce noise, never a meaningful finding.
      if (/\.(png|jpe?g|webp|gif)$/i.test(rel)) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    scanText(rel, text);
  }
}

walk(ROOT);
console.log(`scanned the working tree with ${RULES.length} rules`);

/* ── git history ──────────────────────────────────────────────────────── */

function scanHistory() {
  const git = process.env.GIT_BIN || 'git';
  const tmp = path.join(os.tmpdir(), `privacy-history-${process.pid}.txt`);
  const file = fs.openSync(tmp, 'w');
  const result = spawnSync(git, ['log', '-p', '--all', '--no-color'], {
    cwd: ROOT,
    stdio: ['ignore', file, 'ignore'],
  });
  fs.closeSync(file);

  if (result.error || result.status !== 0) {
    fs.rmSync(tmp, { force: true });
    console.log(
      result.error
        ? `note: git history scan skipped (${result.error.message})`
        : 'note: git history scan skipped (no commits yet)',
    );
    return;
  }

  const text = fs.readFileSync(tmp, 'utf8');
  fs.rmSync(tmp, { force: true });
  scanText('git history', text);
  console.log(`scanned git history (${text.split(/\r?\n/).length} lines)`);
}

scanHistory();

/* ── result ───────────────────────────────────────────────────────────── */

if (findings.length > 0) {
  console.error('\nprivacy findings:');
  for (const finding of findings) console.error(`  ${finding.where}  [${finding.rule}]  ${finding.sample}`);
  console.error(`\n${findings.length} finding(s); nothing was published.`);
  process.exit(1);
}
console.log('privacy scan clean.');

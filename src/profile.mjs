/**
 * Locate the profile patch this plugin manages.
 *
 * The harness exposes the active profile as `DSH_PROFILE` (name) and
 * `DSH_PROFILE_DIR` (directory) in every process it launches; a process that
 * was booted without a profile has neither, so the `~/.dsh/profiles` layout is
 * used as the fallback and finally any profile that already holds an `mcp-`
 * row. Nothing here writes: the caller owns the file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function candidatePaths() {
  const list = [];
  if (process.env.DSH_PROFILE_DIR) {
    list.push(path.join(process.env.DSH_PROFILE_DIR, 'cordis.patch.yml'));
  }
  const profilesDir = path.join(os.homedir(), '.dsh', 'profiles');
  const profile = process.env.DSH_PROFILE || 'desktop';
  list.push(path.join(profilesDir, profile, 'cordis.patch.yml'));
  return list;
}

export function findConfigPath() {
  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const profilesDir = path.join(os.homedir(), '.dsh', 'profiles');
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  for (const dir of dirs) {
    const candidate = path.join(profilesDir, dir, 'cordis.patch.yml');
    try {
      if (fs.existsSync(candidate) && /-\s+id:\s*mcp-/.test(fs.readFileSync(candidate, 'utf8'))) {
        return candidate;
      }
    } catch {
      /* unreadable profile: keep looking */
    }
  }
  return null;
}

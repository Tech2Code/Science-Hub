// Installs repo-tracked git hooks into .git/hooks, since .git/hooks itself
// isn't version-controlled. Runs from postinstall so a fresh clone gets the
// pre-commit migration guard automatically. Never fails the install — a
// missing .git (e.g. installed as a dependency, or a hookless CI checkout)
// just silently skips.
const fs = require("fs");
const path = require("path");

try {
  const gitHooksDir = path.join(__dirname, "..", ".git", "hooks");
  if (!fs.existsSync(gitHooksDir)) process.exit(0);

  const src = path.join(__dirname, "pre-commit-check-migration.sh");
  const dest = path.join(gitHooksDir, "pre-commit");
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
} catch {
  // Best-effort only — never break `npm install` over this.
}

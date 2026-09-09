// Guards against the recurring IST/UTC date-boundary bug class documented in CLAUDE.md
// (Features Completed #48/#53/#54, and the invoice/purchase-bill date fixes this script
// was added alongside). Two anti-patterns, both of which have shipped real bugs before:
//
//   1. Display: `new Date(x).toLocaleDateString("en-IN", {...})` / `.toLocaleString("en-IN", {...})` /
//      `.toLocaleTimeString("en-IN", {...})` with day/month/year/hour options but no explicit
//      `timeZone` — renders in the viewing device's own local timezone instead of IST, so the same
//      value can show a different calendar day on different machines. Use formatDate()/
//      formatDateTime()/formatTime()/formatMonthYear()/formatCreatedSub() from src/lib/formatDate.ts
//      instead — they pin `timeZone: "Asia/Kolkata"` (formatCreatedSub also avoids the sibling UX
//      bug of a bare "created at" time reading as if it belongs to a different, main date shown
//      right above it, once a document has been backdated/postdated from when it was created).
//
//   2. Storage/comparison: `new Date(dateOnlyString)` on a plain "YYYY-MM-DD" string parses it as
//      UTC midnight, ~5.5 hours before the real IST calendar-day boundary. Use istDayStartUtc()/
//      istDayEndUtc()/toIstDateStr()/istTodayStartUtc() from src/lib/validation.ts instead.
//
// Runs over staged files in the pre-commit hook (fast) or the whole src/ tree when run directly
// (`node scripts/check-date-safety.js --all`), e.g. in CI. Intentionally conservative — a narrow,
// pattern-based check that only flags the exact shapes that have actually caused bugs here, not a
// general-purpose AST linter — false negatives are acceptable, false positives block real commits.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ALLOWLISTED_FILES = new Set([
  path.join("src", "lib", "formatDate.ts"),
]);
// Locally-constructed calendar-grid Date objects (no server ISO string / UTC ambiguity involved) —
// see the comment on DatePicker.tsx's dayAriaLabel() for why this one is a deliberate exception.
const ALLOWLISTED_LINE_SUBSTRINGS = [
  "toLocaleDateString(undefined,",
];

function listCandidateFiles(all) {
  if (all) {
    const out = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
      }
    })(path.join(ROOT, "src"));
    return out;
  }
  // `git diff --name-only` always reports forward-slash paths regardless of OS.
  const staged = execSync("git diff --cached --name-only --diff-filter=ACM", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.startsWith("src/") && /\.(ts|tsx)$/.test(f));
  return staged.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
}

function checkDisplayAntiPattern(relPath, lines) {
  const findings = [];
  if (ALLOWLISTED_FILES.has(relPath)) return findings;
  lines.forEach((line, i) => {
    if (ALLOWLISTED_LINE_SUBSTRINGS.some((s) => line.includes(s))) return;
    const isLocaleCall = /\.toLocaleDateString\(|\.toLocaleString\(|\.toLocaleTimeString\(/.test(line);
    if (!isLocaleCall) return;
    const looksDateShaped = /\b(day|month|hour|weekday)\s*:/.test(line);
    if (!looksDateShaped) return; // a bare number/currency .toLocaleString() call, not a date
    if (line.includes("timeZone")) return; // already pinned
    findings.push({ line: i + 1, text: line.trim(), kind: "display" });
  });
  return findings;
}

function checkStorageAntiPattern(relPath, lines) {
  const findings = [];
  // Only API route handlers ingest raw client date strings this way; scoping to them keeps this
  // check from flagging the many legitimate `new Date(someFullTimestamp)` reads elsewhere.
  if (!/^src[\\/]app[\\/]api[\\/].*route\.ts$/.test(relPath.replace(/\\/g, "/"))) return findings;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return; // comments, not code
    // Matches `new Date(date)`, `new Date(billDate)`, `new Date(dueDate)` etc. — a bare identifier
    // ending in "Date"/"date" passed straight to the Date constructor, not wrapped in
    // istDayStartUtc()/istDayEndUtc() and not a `.getTime()`/property access on a real Date object.
    const m = line.match(/new Date\((\s*[a-zA-Z_][a-zA-Z0-9_]*[Dd]ate)\s*\)/);
    if (!m) return;
    if (line.includes("istDayStartUtc") || line.includes("istDayEndUtc")) return;
    // `new Date(existing.date)` / `new Date(existing.billDate)` etc. read an already-precise
    // Date value back off a Prisma row, not a raw "YYYY-MM-DD" client string — safe to ignore.
    if (/new Date\(\s*[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z]+[Dd]ate\s*\)/.test(line)) return;
    // Used only to check whether the string parses at all (isNaN(...).getTime()), never to extract
    // a calendar day/instant from it — safe regardless of which timezone the Date constructor picks.
    if (/isNaN\(\s*new Date\([^)]*\)\.getTime\(\)\s*\)/.test(line)) return;
    findings.push({ line: i + 1, text: line.trim(), kind: "storage" });
  });
  return findings;
}

function main() {
  const all = process.argv.includes("--all");
  const files = listCandidateFiles(all);
  const allFindings = [];
  for (const abs of files) {
    const relPath = path.relative(ROOT, abs);
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const lines = content.split("\n");
    const findings = [...checkDisplayAntiPattern(relPath, lines), ...checkStorageAntiPattern(relPath, lines)];
    for (const f of findings) allFindings.push({ file: relPath, ...f });
  }

  if (allFindings.length === 0) {
    if (all) console.log("check-date-safety: no IST/UTC date anti-patterns found.");
    process.exit(0);
  }

  console.error("");
  console.error("BLOCKED: possible IST/UTC date-boundary bug (see CLAUDE.md 'Do not' rules on date handling).");
  console.error("");
  for (const f of allFindings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text}`);
    if (f.kind === "display") {
      console.error(`    -> use formatDate()/formatDateTime()/formatTime()/formatMonthYear() from src/lib/formatDate.ts`);
    } else {
      console.error(`    -> use istDayStartUtc()/istDayEndUtc() from src/lib/validation.ts instead of a bare new Date(...)`);
    }
    console.error("");
  }
  console.error("If this is a genuine exception, bypass with: git commit --no-verify");
  console.error("");
  process.exit(1);
}

main();

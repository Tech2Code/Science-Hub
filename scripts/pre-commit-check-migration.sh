#!/bin/sh
# Blocks a commit that changes prisma/schema.prisma without also staging a new
# migration folder under prisma/migrations/ — the app is deployed via
# `prisma migrate deploy`, which only ever applies committed migration files,
# so a schema change with no matching migration silently never reaches
# production (see CLAUDE.md's "Do not" rules and Known Issues).
#
# Bypass (rare, e.g. a schema comment-only edit): git commit --no-verify

SCHEMA_CHANGED=$(git diff --cached --name-only | grep -c '^prisma/schema\.prisma$')
NEW_MIGRATION=$(git diff --cached --name-only --diff-filter=A | grep -c '^prisma/migrations/.*/migration\.sql$')

if [ "$SCHEMA_CHANGED" -gt 0 ] && [ "$NEW_MIGRATION" -eq 0 ]; then
  echo ""
  echo "BLOCKED: prisma/schema.prisma changed but no new migration file is staged."
  echo ""
  echo "  Run:  npx prisma migrate dev --name describe-your-change"
  echo "  Then: git add prisma/migrations"
  echo ""
  echo "This app deploys via 'prisma migrate deploy', which only applies committed"
  echo "migration files — a schema change with no migration never reaches production."
  echo ""
  echo "If this schema edit genuinely needs no migration (e.g. a comment-only change),"
  echo "bypass with: git commit --no-verify"
  echo ""
  exit 1
fi

exit 0

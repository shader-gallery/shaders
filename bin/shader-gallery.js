#!/usr/bin/env node
// shader-gallery — the unscoped front-door bin. The catalog lives in THIS repo,
// but the CLI logic lives in @shader-gallery/cli; this thin shim just forwards
// process.argv to its run(), so `npx shader-gallery add <slug>` works without
// bundling the catalog into the package. See ../planning notes / MIGRATION-PLAN
// decision #1 (home-base repo).
import { run } from '@shader-gallery/cli';

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`shader-gallery: ${err.message}\n`);
  process.exit(1);
});

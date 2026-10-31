#!/usr/bin/env node
import { runCheck } from "../check-frontmatter.js";

process.exitCode = runCheck(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

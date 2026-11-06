import { requireRepoInProduction } from "@/lib/env";

// Next logs an error thrown while loading the instrumentation hook but keeps
// serving, so the process is ended explicitly.
try {
  requireRepoInProduction(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

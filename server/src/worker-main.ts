import { pathToFileURL } from "node:url";

import { loadConfig } from "./config.js";

export async function startBusinessWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  loadConfig(env);
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  startBusinessWorker().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

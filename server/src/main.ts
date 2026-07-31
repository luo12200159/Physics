import { pathToFileURL } from "node:url";

import { buildApp, type AppDependencies } from "./app.js";
import { loadConfig } from "./config.js";

function unavailable(name: string): never {
  throw new Error(`${name} adapter is not configured until the persistence task is installed`);
}

export function makeBootstrapDependencies(env: NodeJS.ProcessEnv): AppDependencies {
  const config = loadConfig(env);
  return {
    config,
    postgres: {
      query: async () => unavailable("PostgreSQL"),
    },
    redis: {
      ping: async () => unavailable("Redis"),
      get: async () => unavailable("Redis"),
    },
    objectStorage: {
      healthcheck: async () => unavailable("Object storage"),
    },
  };
}

export async function startBusinessServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const deps = makeBootstrapDependencies(env);
  const app = await buildApp(deps);
  const close = async () => {
    await app.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  await app.listen({ host: deps.config.businessHost, port: deps.config.businessPort });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  startBusinessServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

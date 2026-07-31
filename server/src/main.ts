import { pathToFileURL } from "node:url";

import { buildApp, type AppDependencies } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./infrastructure/db.js";
import { createRedis } from "./infrastructure/redis.js";
import { createAuthService, type AuthRedis } from "./modules/auth/service.js";

function unavailable(name: string): never {
  throw new Error(`${name} adapter is not configured until the persistence task is installed`);
}

export function makeBootstrapDependencies(env: NodeJS.ProcessEnv): AppDependencies {
  const config = loadConfig(env);
  const pool = createPool(config.databaseUrl);
  const redisClient = createRedis(config.redisUrl);
  const authRedis: AuthRedis = {
    get: async (key) => redisClient.get(key),
    set: async (key, value, mode, ttlSeconds) => redisClient.set(key, value, mode, ttlSeconds),
    del: async (key) => redisClient.del(key),
    eval: async (script, numberOfKeys, ...args) => redisClient.eval(script, numberOfKeys, ...args),
  };
  const authService = createAuthService({
    pool,
    redis: authRedis,
    jwtSecret: config.jwtSecret,
    auditIpKey: config.auditIpKey,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  });
  return {
    config,
    postgres: {
      query: async (text, values) => pool.query(text, values ? [...values] : undefined),
      close: async () => pool.end(),
    },
    redis: {
      ping: async () => redisClient.ping(),
      get: async (key) => redisClient.get(key),
      close: async () => {
        await redisClient.quit();
      },
    },
    objectStorage: {
      healthcheck: async () => unavailable("Object storage"),
    },
    authService,
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

import { Redis } from "ioredis";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    enableReadyCheck: true,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });
}

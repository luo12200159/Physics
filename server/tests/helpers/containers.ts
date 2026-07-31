import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

export interface PostgresTestContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
  connectionString(): string;
}

export interface RedisTestContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
  connectionString(): string;
}

export function startPostgres(): PostgresTestContainer {
  let started: StartedPostgreSqlContainer | undefined;

  return {
    async start(): Promise<void> {
      if (started) return;
      started = await new PostgreSqlContainer("postgres:17.5-alpine")
        .withDatabase("physics_studio_test")
        .withUsername("physics_studio_test")
        .withPassword("physics_studio_test")
        .start();
    },
    async stop(): Promise<void> {
      const container = started;
      started = undefined;
      await container?.stop();
    },
    connectionString(): string {
      if (!started) throw new Error("PostgreSQL test container has not started");
      return started.getConnectionUri();
    },
  };
}

export function startRedis(): RedisTestContainer {
  let started: StartedRedisContainer | undefined;

  return {
    async start(): Promise<void> {
      if (started) return;
      started = await new RedisContainer("redis:7.4.2-alpine").start();
    },
    async stop(): Promise<void> {
      const container = started;
      started = undefined;
      await container?.stop();
    },
    connectionString(): string {
      if (!started) throw new Error("Redis test container has not started");
      return started.getConnectionUrl();
    },
  };
}

import { afterEach } from "vitest";

import { buildApp, type AppDependencies } from "../../src/app.js";
import { makeUnitDependencies, type UnitDependencyOverrides } from "./factories.js";

const openApps = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  const apps = [...openApps];
  openApps.clear();
  await Promise.allSettled(apps.map(async (app) => app.close()));
});

export async function buildTestApp(
  overrides: UnitDependencyOverrides = {},
): Promise<Awaited<ReturnType<typeof buildApp>>> {
  const deps: AppDependencies = makeUnitDependencies(overrides);
  const app = await buildApp(deps);
  openApps.add(app);
  return app;
}

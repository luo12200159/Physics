import type { FastifyRequest } from "fastify";

export interface RequestContext {
  requestId: string;
  now: Date;
}

export type Clock = () => Date;

export function makeRequestContext(
  request: Pick<FastifyRequest, "id">,
  clock: Clock = () => new Date(),
): RequestContext {
  return {
    requestId: request.id,
    now: clock(),
  };
}

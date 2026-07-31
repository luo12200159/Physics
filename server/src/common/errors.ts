import { Type, type Static } from "@sinclair/typebox";

import { StrictObject } from "./schema.js";

export const ApiErrorBodySchema = StrictObject({
  code: Type.String({ minLength: 1, maxLength: 120 }),
  message: Type.String({ minLength: 1, maxLength: 1_000 }),
  requestId: Type.String({ minLength: 1, maxLength: 200 }),
});

export type ApiErrorBody = Static<typeof ApiErrorBodySchema>;

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function apiErrorBody(error: ApiError, requestId: string): ApiErrorBody {
  return {
    code: error.code,
    message: error.message,
    requestId,
  };
}

import { Type, type TProperties } from "@sinclair/typebox";

export function StrictObject<T extends TProperties>(properties: T) {
  return Type.Object(properties, { additionalProperties: false });
}

import { describe, expect, it } from "vitest";

import { parseCreateUserArguments } from "../../src/cli/create-user.js";

describe("create-user command arguments", () => {
  it("requires explicit identity fields and normalizes the login", () => {
    expect(parseCreateUserArguments([
      "--login", "Teacher-001",
      "--display-name", "  王老师  ",
      "--role", "teacher",
      "--password-stdin",
    ])).toEqual({
      login: "teacher-001",
      displayName: "王老师",
      role: "teacher",
      passwordStdin: true,
    });
  });

  it.each([
    [["--password", "secret"], "Password arguments are forbidden"],
    [["--password=secret"], "Password arguments are forbidden"],
    [["--unknown"], "Unknown argument"],
  ] as const)("rejects secret-bearing or unknown flags", (args, message) => {
    expect(() => parseCreateUserArguments([
      "--login", "teacher-001",
      "--display-name", "王老师",
      "--role", "teacher",
      ...args,
    ])).toThrow(message);
  });

  it("rejects missing required identity fields and invalid roles", () => {
    expect(() => parseCreateUserArguments(["--login", "teacher-001"])).toThrow("required");
    expect(() => parseCreateUserArguments([
      "--login", "teacher-001",
      "--display-name", "王老师",
      "--role", "superuser",
    ])).toThrow("--role is invalid");
  });
});

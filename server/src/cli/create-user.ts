import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

import { createPool, withTransaction } from "../infrastructure/db.js";
import type { UserRole } from "../modules/auth/contracts.js";
import { hashPassword } from "../modules/auth/password.js";
import { normalizeLogin } from "../modules/auth/repository.js";

export interface CreateUserArguments {
  login: string;
  displayName: string;
  role: UserRole;
  passwordStdin: boolean;
}

const roles = new Set<UserRole>(["student", "teacher", "parent", "administrator"]);

export function parseCreateUserArguments(args: readonly string[]): CreateUserArguments {
  let login: string | undefined;
  let displayName: string | undefined;
  let role: UserRole | undefined;
  let passwordStdin = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--password-stdin") {
      if (passwordStdin) throw new Error("--password-stdin may be supplied only once");
      passwordStdin = true;
      continue;
    }
    if (argument?.startsWith("--password")) {
      throw new Error("Password arguments are forbidden; use the prompt or --password-stdin");
    }
    if (argument !== "--login" && argument !== "--display-name" && argument !== "--role") {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    index += 1;
    if (argument === "--login") {
      if (login !== undefined) throw new Error("--login may be supplied only once");
      login = value;
    } else if (argument === "--display-name") {
      if (displayName !== undefined) throw new Error("--display-name may be supplied only once");
      displayName = value;
    } else {
      if (role !== undefined) throw new Error("--role may be supplied only once");
      if (!roles.has(value as UserRole)) throw new Error("--role is invalid");
      role = value as UserRole;
    }
  }

  if (login === undefined || displayName === undefined || role === undefined) {
    throw new Error("--login, --display-name, and --role are required");
  }
  const normalizedDisplayName = displayName.trim();
  if (normalizedDisplayName.length < 1 || normalizedDisplayName.length > 80) {
    throw new Error("--display-name must contain between 1 and 80 characters");
  }
  return {
    login: normalizeLogin(login),
    displayName: normalizedDisplayName,
    role,
    passwordStdin,
  };
}

function removeOneLineTerminator(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

async function readPasswordFromStdin(): Promise<string> {
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  return removeOneLineTerminator(value);
}

async function readHiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("A TTY is required unless --password-stdin is explicitly supplied");
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdout.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl === true && key.name === "c") {
        cleanup();
        reject(new Error("Password entry cancelled"));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (character && !/[\u0000-\u001f\u007f]/u.test(character) && value.length < 1_024) {
        value += character;
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

function validateInitialPassword(password: string): void {
  if (password.length < 12 || password.length > 1_024 || /[\r\n\u0000]/u.test(password)) {
    throw new Error("Password must contain 12-1024 characters and no line breaks or NUL bytes");
  }
}

export async function createUserCommand(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const parsed = parseCreateUserArguments(args);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const password = parsed.passwordStdin ? await readPasswordFromStdin() : await readHiddenPassword();
  validateInitialPassword(password);
  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  const pool = createPool(databaseUrl);
  try {
    await withTransaction(pool, async (tx) => {
      await tx.query(
        `insert into users(id, role, display_name, status, must_change_password)
         values ($1, $2, $3, 'active', false)`,
        [userId, parsed.role, parsed.displayName],
      );
      await tx.query(
        `insert into password_credentials(user_id, login_normalized, password_hash)
         values ($1, $2, $3)`,
        [userId, parsed.login, passwordHash],
      );
    });
  } finally {
    await pool.end();
  }
  return userId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createUserCommand(process.argv.slice(2)).then((userId) => {
    process.stdout.write(`Created user ${userId}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "User creation failed"}\n`);
    process.exitCode = 1;
  });
}

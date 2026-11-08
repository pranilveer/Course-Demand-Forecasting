export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token || !token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const equalsIndex = body.indexOf('=');
    if (equalsIndex >= 0) {
      flags[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1);
      continue;
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      index += 1;
    } else {
      flags[body] = true;
    }
  }

  return { command, flags };
}

export function stringFlag(
  args: ParsedArgs,
  key: string,
  fallback: string,
): string {
  const value = args.flags[key];
  return typeof value === 'string' ? value : fallback;
}

export function numberFlag(
  args: ParsedArgs,
  key: string,
  fallback: number,
): number {
  const value = args.flags[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Flag --${key} must be a number, received: ${value}`);
  }
  return parsed;
}

export function booleanFlag(
  args: ParsedArgs,
  key: string,
  fallback: boolean,
): boolean {
  const value = args.flags[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'yes';
  }
  return fallback;
}

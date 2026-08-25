export type AppErrorKind = "stale-build" | "auth" | "network" | "data" | "unexpected";

const STALE_BUILD_PATTERN =
  /failed to fetch dynamically imported module|importing a module script failed|loading chunk [\w-]+ failed|error loading dynamically imported module|module script.*failed/i;
const AUTH_PATTERN =
  /unauthorized|invalid token|jwt.*expired|session.*expired|sesión.*caduc|no authorization header/i;
const NETWORK_PATTERN =
  /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|connection/i;
const DATA_PATTERN =
  /permission denied|row-level security|statement timeout|resource limit|no space left|postgrest|pgrst\d+/i;

export type AppErrorInfo = {
  kind: AppErrorKind;
  reference: string;
  message: string;
};

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
    return [value.message, value.code, value.status, value.statusCode]
      .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
      .join(" ");
  }
  return "Error desconocido";
}

function makeReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FIG-${stamp}-${random}`;
}

export function classifyAppError(error: unknown): AppErrorInfo {
  const message = errorText(error);
  const status =
    error && typeof error === "object"
      ? Number((error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode)
      : 0;

  let kind: AppErrorKind = "unexpected";
  if (STALE_BUILD_PATTERN.test(message)) kind = "stale-build";
  else if (status === 401 || AUTH_PATTERN.test(message)) kind = "auth";
  else if (NETWORK_PATTERN.test(message)) kind = "network";
  else if (status === 403 || status === 429 || status >= 500 || DATA_PATTERN.test(message)) kind = "data";

  return { kind, reference: makeReference(), message };
}

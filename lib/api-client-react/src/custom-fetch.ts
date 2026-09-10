export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 *
 * NOTE: This function should never be used in web applications where session
 * token cookies are automatically associated with API calls by the browser.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  // Only prepend to relative paths (starting with /)
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  // Attach bearer token when an auth getter is configured and no
  // Authorization header has been explicitly provided.
  if (_authTokenGetter && !headers.has("authorization")) {
    const token = await _authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestInfo = { method, url: resolveUrl(input) };

  try {
    const response = await fetch(input, { ...init, method, headers });

    if (!response.ok) {
      if (response.status === 404 && requestInfo.url.includes("/api/")) {
        const fallback = await handleStaticFallback(requestInfo.url, method, typeof init.body === "string" ? init.body : undefined);
        if (fallback !== null) return fallback as T;
      }
      const errorData = await parseErrorBody(response, method);
      throw new ApiError(response, errorData, requestInfo);
    }

    return (await parseSuccessBody(response, responseType, requestInfo)) as T;
  } catch (err) {
    if (requestInfo.url.includes("/api/")) {
      const fallback = await handleStaticFallback(requestInfo.url, method, typeof init.body === "string" ? init.body : undefined);
      if (fallback !== null) return fallback as T;
    }
    throw err;
  }
}

const CLIENT_TASKS_KEY = "tareas.local_tasks_data";
const CLIENT_SUPABASE_KEY = "tareas.supabase_client_config";

export interface ClientSupabaseConfig {
  url: string;
  anonKey: string;
}

export const DEFAULT_SUPABASE_CONFIG: ClientSupabaseConfig = {
  url: "https://ewgfotjewroksgppxfor.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3Z2ZvdGpld3Jva3NncHB4Zm9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODYxMzgsImV4cCI6MjEwNDU2MjEzOH0.LIdDwZrBsL7ZcELF8woolG6VCs5502u_YuUwwSEC3uw",
};

export function normalizeSupabaseUrl(rawUrl: string): string {
  let u = (rawUrl || '').trim().replace(/\/+$/, '');
  const matchDashboard = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (matchDashboard) {
    return `https://${matchDashboard[1]}.supabase.co`;
  }
  const matchSupabaseCo = u.match(/(https?:\/\/[a-z0-9_-]+\.supabase\.co)/i);
  if (matchSupabaseCo) {
    return matchSupabaseCo[1].toLowerCase();
  }
  const matchBareCo = u.match(/^([a-z0-9_-]+\.supabase\.co)/i);
  if (matchBareCo) {
    return `https://${matchBareCo[1].toLowerCase()}`;
  }
  if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`;
  }
  return u.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

export function getClientSupabaseConfig(): ClientSupabaseConfig | null {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(CLIENT_SUPABASE_KEY);
      if (stored) {
        if (stored === "local_only") return null;
        const parsed = JSON.parse(stored);
        if (parsed?.url && parsed?.anonKey) {
          return { url: normalizeSupabaseUrl(parsed.url), anonKey: parsed.anonKey };
        }
      }
    }
    const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
    if (metaEnv) {
      const url = metaEnv.VITE_SUPABASE_URL;
      const anonKey = metaEnv.VITE_SUPABASE_ANON_KEY;
      if (url && anonKey && !url.includes("your-project")) {
        return { url: normalizeSupabaseUrl(url), anonKey };
      }
    }
    return DEFAULT_SUPABASE_CONFIG;
  } catch {}
  return DEFAULT_SUPABASE_CONFIG;
}

export function saveClientSupabaseConfig(config: ClientSupabaseConfig | null): void {
  try {
    if (typeof localStorage !== "undefined") {
      if (config) {
        localStorage.setItem(CLIENT_SUPABASE_KEY, JSON.stringify({
          url: normalizeSupabaseUrl(config.url),
          anonKey: config.anonKey.trim(),
        }));
      } else {
        localStorage.setItem(CLIENT_SUPABASE_KEY, "local_only");
      }
    }
  } catch {}
}

const INITIAL_DEMO_TASKS = [
  {
    id: 1,
    course: "1A",
    title: "Informe de laboratorio: Fotos\u00EDntesis y pigmentos vegetales",
    description: "Entregar informe escrito con an\u00E1lisis de cromatograf\u00EDa en papel y conclusiones.",
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    course: "2A",
    title: "Maqueta tridimensional de la c\u00E9lula eucariota animal",
    description: "Identificar claramente el n\u00FAcleo, mitocondrias, ret\u00EDculo endoplasm\u00E1tico y aparato de Golgi.",
    dueAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    course: "3A",
    title: "Gu\u00EDa de estudio: Gen\u00E9tica mendeliana y cuadros de Punnett",
    description: "Resolver los 10 ejercicios del cuaderno de actividades cap\u00EDtulo 4.",
    dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 4,
    course: "4A",
    title: "Ensayo: Teor\u00EDa de la evoluci\u00F3n por selecci\u00F3n natural",
    description: "M\u00E1ximo 3 p\u00E1ginas comparando el darwinismo con las teor\u00EDas de Lamarck.",
    dueAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function getStoredClientTasks(): any[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLIENT_TASKS_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return INITIAL_DEMO_TASKS;
}

function saveStoredClientTasks(tasks: any[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CLIENT_TASKS_KEY, JSON.stringify(tasks));
    }
  } catch {}
}

async function handleStaticFallback(url: string, method: string, bodyStr?: string): Promise<any> {
  const cleanPath = url.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  const searchParams = new URL(url, "https://local.mock").searchParams;
  const sbConfig = getClientSupabaseConfig();

  if (cleanPath.endsWith("/api/health")) {
    return { status: "ok" };
  }

  if (cleanPath.endsWith("/api/db-status")) {
    if (sbConfig) {
      return {
        activeDatabase: "Supabase (Nube)",
        isSupabase: true,
        isPartial: false,
        diagnostics: {
          message: "Conectado a la base de datos Supabase.",
          isReady: true,
          urlIsPlaceholder: false,
        },
      };
    }
    return {
      activeDatabase: "En memoria (Local)",
      isSupabase: false,
      isPartial: false,
      diagnostics: {
        message: "Operando localmente. Conecta Supabase para guardar tus tareas en la nube.",
        isReady: false,
        urlIsPlaceholder: false,
      },
    };
  }

  if (cleanPath.endsWith("/api/auth/login") && method === "POST") {
    const data = bodyStr ? JSON.parse(bodyStr) : {};
    const pwd = String(data.password || "").trim();
    if (pwd === "BiologiaRamiro1") {
      return { token: "static-teacher-token", role: "teacher", course: null };
    }
    const studentMatch = pwd.match(/^Bolivia([1-6])$/);
    if (studentMatch) {
      return { token: `static-student-token-${studentMatch[1]}A`, role: "student", course: `${studentMatch[1]}A` };
    }
    const fakeResp = new Response(JSON.stringify({ message: "Contrase\u00F1a incorrecta." }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/json" },
    });
    throw new ApiError(fakeResp, { message: "Contrase\u00F1a incorrecta." }, { method, url });
  }

  if (cleanPath.endsWith("/api/auth/session")) {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("tareas.auth-session") : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.role) return parsed;
      } catch {}
    }
    return { role: "teacher", course: null };
  }

  if (cleanPath.endsWith("/api/auth/logout")) {
    return { success: true };
  }

  if (cleanPath.includes("/api/tasks")) {
    const tasks = getStoredClientTasks();
    const idMatch = cleanPath.match(/\/api\/tasks\/(\d+)/);

    // If Supabase is configured, use its REST API directly
    if (sbConfig) {
      const cleanUrl = sbConfig.url.replace(/\/+$/, "");
      const headers = {
        apikey: sbConfig.anonKey,
        Authorization: `Bearer ${sbConfig.anonKey}`,
        "Content-Type": "application/json",
      };

      try {
        if (idMatch) {
          const taskId = Number(idMatch[1]);
          if (method === "PATCH") {
            const updateData = bodyStr ? JSON.parse(bodyStr) : {};
            const patchBody: any = {};
            if (updateData.title !== undefined) patchBody.title = updateData.title;
            if (updateData.description !== undefined) patchBody.description = updateData.description;
            if (updateData.course !== undefined) patchBody.course = updateData.course;
            if (updateData.dueAt !== undefined) patchBody.due_at = updateData.dueAt;
            patchBody.updated_at = new Date().toISOString();

            const res = await fetch(`${cleanUrl}/rest/v1/tasks?id=eq.${taskId}`, {
              method: "PATCH",
              headers: { ...headers, Prefer: "return=representation" },
              body: JSON.stringify(patchBody),
            });
            if (res.ok) {
              const [updated] = await res.json();
              if (updated) {
                return {
                  id: updated.id,
                  course: updated.course,
                  title: updated.title,
                  description: updated.description || "",
                  dueAt: updated.due_at,
                  createdAt: updated.created_at,
                  updatedAt: updated.updated_at,
                };
              }
            }
          }
          if (method === "DELETE") {
            const res = await fetch(`${cleanUrl}/rest/v1/tasks?id=eq.${taskId}`, {
              method: "DELETE",
              headers,
            });
            if (res.ok) {
              return { id: taskId };
            }
          }
        }

        if (method === "GET") {
          const courseFilter = searchParams.get("course");
          let endpoint = `${cleanUrl}/rest/v1/tasks?select=*&order=due_at.asc`;
          if (courseFilter) {
            endpoint += `&course=eq.${courseFilter}`;
          }
          const res = await fetch(endpoint, { headers });
          if (res.ok) {
            const rows = await res.json();
            return rows.map((r: any) => ({
              id: r.id,
              course: r.course,
              title: r.title,
              description: r.description || "",
              dueAt: r.due_at,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            }));
          }
        }

        if (method === "POST") {
          const newTask = bodyStr ? JSON.parse(bodyStr) : {};
          const res = await fetch(`${cleanUrl}/rest/v1/tasks`, {
            method: "POST",
            headers: { ...headers, Prefer: "return=representation" },
            body: JSON.stringify({
              course: newTask.course,
              title: newTask.title,
              description: newTask.description || "",
              due_at: newTask.dueAt,
            }),
          });
          if (res.ok) {
            const [created] = await res.json();
            if (created) {
              return {
                id: created.id,
                course: created.course,
                title: created.title,
                description: created.description || "",
                dueAt: created.due_at,
                createdAt: created.created_at,
                updatedAt: created.updated_at,
              };
            }
          }
        }
      } catch (sbErr) {
        console.warn("[Tareas] Error communicating with Supabase, using local fallback:", sbErr);
      }
    }

    // Local Storage Fallback
    if (idMatch) {
      const taskId = Number(idMatch[1]);
      if (method === "PATCH") {
        const updateData = bodyStr ? JSON.parse(bodyStr) : {};
        const idx = tasks.findIndex((t: any) => t.id === taskId);
        if (idx !== -1) {
          tasks[idx] = { ...tasks[idx], ...updateData, updatedAt: new Date().toISOString() };
          saveStoredClientTasks(tasks);
          return tasks[idx];
        }
      }
      if (method === "DELETE") {
        const idx = tasks.findIndex((t: any) => t.id === taskId);
        if (idx !== -1) {
          const [removed] = tasks.splice(idx, 1);
          saveStoredClientTasks(tasks);
          return removed;
        }
      }
    }

    if (method === "GET") {
      const courseFilter = searchParams.get("course");
      if (courseFilter) {
        return tasks.filter((t: any) => t.course === courseFilter).sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
      }
      return tasks.sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    }

    if (method === "POST") {
      const newTask = bodyStr ? JSON.parse(bodyStr) : {};
      const created = {
        id: Date.now(),
        course: newTask.course,
        title: newTask.title,
        description: newTask.description || "",
        dueAt: new Date(newTask.dueAt).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      tasks.push(created);
      saveStoredClientTasks(tasks);
      return created;
    }
  }

  return null;
}

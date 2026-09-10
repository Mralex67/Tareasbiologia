import type { CourseCode } from "./session";

type SupabaseTaskRow = {
  id: number;
  course: CourseCode;
  title: string;
  description: string | null;
  due_at: string;
  created_at: string;
  updated_at: string;
};

type TaskInput = {
  course: CourseCode;
  title: string;
  description?: string;
  dueAt: Date;
};

const taskColumns =
  "id,course,title,description,due_at,created_at,updated_at";

function getSupabaseUrl(): string {
  let url = (process.env.SUPABASE_URL ?? "").trim();
  if (!url || isPlaceholder(url)) {
    const fallback = (process.env.SUPABASE_DATABASE_URL ?? "").trim();
    if (fallback.startsWith("http://") || fallback.startsWith("https://")) {
      url = fallback;
    }
  }
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

function getSupabaseKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes("your-project") ||
    lower.includes("example.com") ||
    lower.includes("replace-with") ||
    lower.includes("placeholder")
  );
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  return Boolean(url && key && !isPlaceholder(url) && !isPlaceholder(key));
}

export function isSupabasePartiallyConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url && !key) return false;
  if (isPlaceholder(url) && isPlaceholder(key)) return false;
  return !isSupabaseConfigured();
}

export function getSupabaseDiagnostics() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  const hasUrl = Boolean(url);
  const hasKey = Boolean(key);
  const urlIsPlaceholder = isPlaceholder(url);
  const keyIsPlaceholder = isPlaceholder(key);
  const isReady = hasUrl && hasKey && !urlIsPlaceholder && !keyIsPlaceholder;

  let message = "";
  if (isReady) {
    message = "Supabase está conectado correctamente.";
  } else if (hasKey && (!hasUrl || urlIsPlaceholder)) {
    message = "Tienes la clave configurada, pero SUPABASE_URL aún tiene el valor de ejemplo 'your-project'. Cámbialo en Settings > Secrets por la URL real de tu proyecto de Supabase (ej: https://xxxxxxxxxxxx.supabase.co).";
  } else if (hasUrl && !urlIsPlaceholder && !hasKey) {
    message = "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Settings > Secrets.";
  } else {
    message = "Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para conectar con la nube.";
  }

  return {
    isReady,
    hasUrl,
    hasKey,
    urlIsPlaceholder,
    message,
    url: isReady ? url : undefined,
  };
}

function assertConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  assertConfigured();

  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: getSupabaseKey(),
      authorization: `Bearer ${getSupabaseKey()}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    if (
      body.includes("violates row-level security policy") ||
      body.includes("42501")
    ) {
      throw new Error(
        "Supabase bloqueó el guardado porque la tabla 'tasks' tiene Row Level Security (RLS) activo. Ejecuta en Supabase > SQL Editor: 'alter table public.tasks disable row level security;' o pega la clave 'service_role' en Secrets.",
      );
    }
    throw new Error(
      `Supabase respondió ${response.status}: ${body || response.statusText}`,
    );
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

function toApiTask(row: SupabaseTaskRow) {
  return {
    id: row.id,
    course: row.course,
    title: row.title,
    description: row.description ?? "",
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSupabaseTasks(course?: CourseCode) {
  const params = new URLSearchParams({
    select: taskColumns,
    order: "due_at.asc",
  });
  if (course) params.set("course", `eq.${course}`);

  const rows = await supabaseRequest<SupabaseTaskRow[]>(
    `tasks?${params.toString()}`,
  );
  return rows.map(toApiTask);
}

export async function createSupabaseTask(input: TaskInput) {
  const rows = await supabaseRequest<SupabaseTaskRow[]>("tasks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      course: input.course,
      title: input.title,
      description: input.description ?? "",
      due_at: input.dueAt.toISOString(),
    }),
  });

  const [task] = rows;
  if (!task) throw new Error("Supabase no devolvió la tarea creada.");
  return toApiTask(task);
}

export async function updateSupabaseTask(id: number, input: TaskInput) {
  const rows = await supabaseRequest<SupabaseTaskRow[]>(
    `tasks?id=eq.${encodeURIComponent(String(id))}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        course: input.course,
        title: input.title,
        description: input.description ?? "",
        due_at: input.dueAt.toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );

  const [task] = rows;
  return task ? toApiTask(task) : null;
}

export async function deleteSupabaseTask(id: number): Promise<boolean> {
  const rows = await supabaseRequest<SupabaseTaskRow[]>(
    `tasks?id=eq.${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  return rows.length > 0;
}
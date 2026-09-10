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
  return (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
}

function getSupabaseKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function isSupabasePartiallyConfigured(): boolean {
  return Boolean(getSupabaseUrl() || getSupabaseKey()) && !isSupabaseConfigured();
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
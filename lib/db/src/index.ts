import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import type { Task } from "./schema/tasks";

const { Pool } = pg;

function extractFieldAndValue(clause: any): { field?: string; value?: any } {
  if (!clause) return {};
  if (Array.isArray(clause.queryChunks)) {
    let field: string | undefined;
    let value: any;
    for (const chunk of clause.queryChunks) {
      if (chunk && typeof chunk === "object") {
        if ("name" in chunk && typeof chunk.name === "string") {
          field = chunk.name;
        }
        if ("value" in chunk && chunk.constructor?.name === "Param") {
          value = chunk.value;
        }
      }
    }
    return { field, value };
  }
  return { value: clause.value };
}

let nextId = 5;
const inMemoryTasks: Task[] = [
  {
    id: 1,
    course: "1A",
    title: "Informe de laboratorio: Fotosíntesis y pigmentos vegetales",
    description: "Entregar informe escrito con análisis de cromatografía en papel y conclusiones.",
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    course: "2A",
    title: "Maqueta tridimensional de la célula eucariota animal",
    description: "Identificar claramente el núcleo, mitocondrias, retículo endoplasmático y aparato de Golgi.",
    dueAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    course: "3A",
    title: "Guía de estudio: Genética mendeliana y cuadros de Punnett",
    description: "Resolver los 10 ejercicios del cuaderno de actividades capítulo 4.",
    dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 4,
    course: "4A",
    title: "Ensayo: Teoría de la evolución por selección natural",
    description: "Máximo 3 páginas comparando el darwinismo con las teorías de Lamarck.",
    dueAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function createMockDb(): any {
  return {
    select: () => ({
      from: () => ({
        where: (whereClause: any) => ({
          orderBy: () => {
            const { field, value } = extractFieldAndValue(whereClause);
            const list =
              field === "course" && value
                ? inMemoryTasks.filter((t) => t.course === String(value))
                : field === "id" && value !== undefined
                  ? inMemoryTasks.filter((t) => t.id === Number(value))
                  : [...inMemoryTasks];
            return Promise.resolve(
              list.sort(
                (a, b) =>
                  new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
              ),
            );
          },
        }),
        orderBy: () => {
          return Promise.resolve(
            [...inMemoryTasks].sort(
              (a, b) =>
                new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
            ),
          );
        },
      }),
    }),
    insert: () => ({
      values: (val: any) => ({
        returning: () => {
          const created: Task = {
            id: nextId++,
            course: val.course,
            title: val.title,
            description: val.description ?? "",
            dueAt: new Date(val.dueAt),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          inMemoryTasks.push(created);
          return Promise.resolve([created]);
        },
      }),
    }),
    update: () => ({
      set: (val: any) => ({
        where: (whereClause: any) => ({
          returning: () => {
            const { value } = extractFieldAndValue(whereClause);
            const idVal = Number(value);
            const index = inMemoryTasks.findIndex((t) => t.id === idVal);
            if (index === -1) return Promise.resolve([]);
            const updated: Task = {
              ...inMemoryTasks[index],
              ...(val.course !== undefined && { course: val.course }),
              ...(val.title !== undefined && { title: val.title }),
              ...(val.description !== undefined && { description: val.description }),
              ...(val.dueAt !== undefined && { dueAt: new Date(val.dueAt) }),
              updatedAt: new Date(),
            };
            inMemoryTasks[index] = updated;
            return Promise.resolve([updated]);
          },
        }),
      }),
    }),
    delete: () => ({
      where: (whereClause: any) => ({
        returning: () => {
          const { value } = extractFieldAndValue(whereClause);
          const idVal = Number(value);
          const index = inMemoryTasks.findIndex((t) => t.id === idVal);
          if (index === -1) return Promise.resolve([]);
          const [deleted] = inMemoryTasks.splice(index, 1);
          return Promise.resolve([deleted]);
        },
      }),
    }),
  };
}

let pool: any = null;
let db: any = null;

const rawConn = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const dbConnectionString = rawConn?.startsWith("postgres://") || rawConn?.startsWith("postgresql://")
  ? rawConn
  : undefined;

if (dbConnectionString) {
  try {
    const isSupabase = dbConnectionString.includes("supabase.co") || dbConnectionString.includes("pooler.supabase.com");
    pool = new Pool({
      connectionString: dbConnectionString,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn("[AI Studio] Error connecting to DATABASE_URL, using in-memory mock:", err);
    db = createMockDb();
  }
} else {
  console.info("[AI Studio] DATABASE_URL not set — using in-memory store for tasks.");
  db = createMockDb();
}

export { pool, db };
export * from "./schema";

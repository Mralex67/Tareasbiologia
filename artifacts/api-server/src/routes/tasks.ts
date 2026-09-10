import { Router, type IRouter, type Request } from "express";
import { asc, eq } from "drizzle-orm";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  ListTasksQueryParams,
  ListTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  getSession,
  type CourseCode,
  type Session,
} from "../lib/session";
import {
  createSupabaseTask,
  deleteSupabaseTask,
  isSupabaseConfigured,
  isSupabasePartiallyConfigured,
  listSupabaseTasks,
  updateSupabaseTask,
} from "../lib/supabase";

const router: IRouter = Router();
let replitStoragePromise: Promise<typeof import("@workspace/db")> | null = null;

async function getReplitStorage(): Promise<typeof import("@workspace/db")> {
  replitStoragePromise ??= import("@workspace/db");
  return replitStoragePromise;
}

async function getLocalTasks(course?: CourseCode) {
  const { db, tasksTable } = await getReplitStorage();
  return course
    ? db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.course, course))
        .orderBy(asc(tasksTable.dueAt))
    : db.select().from(tasksTable).orderBy(asc(tasksTable.dueAt));
}

function useSupabase(): boolean {
  return isSupabaseConfigured();
}

function readSession(req: Request): Session | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return getSession(header.slice("Bearer ".length).trim());
}

function canAccessCourse(session: Session, course: CourseCode): boolean {
  return session.role === "teacher" || session.course === course;
}

router.get("/tasks", async (req, res): Promise<void> => {
  try {
    const session = readSession(req);
    if (!session) {
      res.status(401).json({ error: "Inicia sesión para ver las tareas." });
      return;
    }

    const query = ListTasksQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "El curso seleccionado no es válido." });
      return;
    }

    const course = query.data.course ?? session.course;
    if (course && !canAccessCourse(session, course)) {
      res.status(403).json({ error: "Solo puedes ver las tareas de tu curso." });
      return;
    }

    let tasks: any[] = [];
    if (useSupabase()) {
      try {
        tasks = await listSupabaseTasks(course ?? undefined);
      } catch (err) {
        console.warn("[Tasks] Error fetching from Supabase, falling back to local:", err);
        tasks = await getLocalTasks(course ?? undefined);
      }
    } else {
      tasks = await getLocalTasks(course ?? undefined);
    }

    res.json(ListTasksResponse.parse(tasks));
  } catch (err: any) {
    console.error("[Tasks] Error handling GET /tasks:", err);
    res.status(500).json({ error: err?.message || "Error al obtener las tareas." });
  }
});

router.post("/tasks", async (req, res): Promise<void> => {
  try {
    const session = readSession(req);
    if (!session || session.role !== "teacher") {
      res.status(401).json({ error: "Solo el profesor puede crear tareas." });
      return;
    }

    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Completa el curso, la actividad y la fecha." });
      return;
    }

    let task: any = null;
    if (useSupabase()) {
      task = await createSupabaseTask(parsed.data);
    } else {
      const { db, tasksTable } = await getReplitStorage();
      const [created] = await db
        .insert(tasksTable)
        .values({
          ...parsed.data,
          dueAt: parsed.data.dueAt,
          updatedAt: new Date(),
        })
        .returning();
      task = created;
    }

    res.status(201).json(CreateTaskResponse.parse(task));
  } catch (err: any) {
    console.error("[Tasks] Error handling POST /tasks:", err);
    res.status(500).json({ error: err?.message || "Error al crear la tarea." });
  }
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  try {
    const session = readSession(req);
    if (!session || session.role !== "teacher") {
      res.status(401).json({ error: "Solo el profesor puede editar tareas." });
      return;
    }

    const params = UpdateTaskParams.safeParse(req.params);
    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Los datos de la tarea no son válidos." });
      return;
    }

    let task: any = null;
    if (useSupabase()) {
      try {
        task = await updateSupabaseTask(params.data.id, parsed.data);
      } catch (err) {
        console.warn("[Tasks] Error updating in Supabase, falling back to local:", err);
        const { db, tasksTable } = await getReplitStorage();
        const [updated] = await db
          .update(tasksTable)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(tasksTable.id, params.data.id))
          .returning();
        task = updated;
      }
    } else {
      const { db, tasksTable } = await getReplitStorage();
      const [updated] = await db
        .update(tasksTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(tasksTable.id, params.data.id))
        .returning();
      task = updated;
    }

    if (!task) {
      res.status(404).json({ error: "No se encontró la tarea." });
      return;
    }

    res.json(UpdateTaskResponse.parse(task));
  } catch (err: any) {
    console.error("[Tasks] Error handling PATCH /tasks/:id:", err);
    res.status(500).json({ error: err?.message || "Error al editar la tarea." });
  }
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  try {
    const session = readSession(req);
    if (!session || session.role !== "teacher") {
      res.status(401).json({ error: "Solo el profesor puede eliminar tareas." });
      return;
    }

    const params = DeleteTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "El identificador de la tarea no es válido." });
      return;
    }

    let success = false;
    if (useSupabase()) {
      try {
        success = await deleteSupabaseTask(params.data.id);
      } catch (err) {
        console.warn("[Tasks] Error deleting in Supabase, falling back to local:", err);
        const { db, tasksTable } = await getReplitStorage();
        const [deleted] = await db
          .delete(tasksTable)
          .where(eq(tasksTable.id, params.data.id))
          .returning();
        success = Boolean(deleted);
      }
    } else {
      const { db, tasksTable } = await getReplitStorage();
      const [deleted] = await db
        .delete(tasksTable)
        .where(eq(tasksTable.id, params.data.id))
        .returning();
      success = Boolean(deleted);
    }

    if (!success) {
      res.status(404).json({ error: "No se encontró la tarea." });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    console.error("[Tasks] Error handling DELETE /tasks/:id:", err);
    res.status(500).json({ error: err?.message || "Error al eliminar la tarea." });
  }
});

export default router;
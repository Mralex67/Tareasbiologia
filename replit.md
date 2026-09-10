# Tareas

Aplicación escolar para publicar y consultar tareas organizadas por curso desde cualquier dispositivo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env for the local fallback: `DATABASE_URL` — Postgres connection string
- Vercel/Supabase env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tareas/src/App.tsx` — aplicación web, sesiones, paneles de profesor y estudiante.
- `artifacts/tareas/src/index.css` — tokens y estilos de la interfaz.
- `artifacts/api-server/src/routes/auth.ts` — acceso por contraseña y sesiones.
- `artifacts/api-server/src/routes/tasks.ts` — CRUD de tareas.
- `artifacts/api-server/src/lib/session.ts` — credenciales iniciales y sesiones firmadas.
- `artifacts/api-server/src/lib/supabase.ts` — acceso REST a Supabase para Vercel.
- `lib/db/src/schema/tasks.ts` — tabla persistente de tareas.
- `lib/api-spec/openapi.yaml` — contrato único de la API.
- `supabase/migrations/20260910000000_create_tasks.sql` — esquema y datos exportados para Supabase.
- `docs/vercel-supabase.md` — pasos para importar la base y publicar en Vercel.

## Architecture decisions

- En desarrollo, la app puede usar el PostgreSQL administrado del workspace como fallback. Para Vercel, cuando existen `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, la API usa Supabase mediante PostgREST.
- La autenticación inicial es deliberadamente solo por contraseña: las contraseñas se leen desde variables de entorno y nunca se guardan en el repositorio.
- La interfaz web se puede instalar como PWA; el botón de instalación aparece en navegadores compatibles y el menú del navegador sirve como alternativa.
- La fecha de entrega se guarda como timestamp con zona horaria y el color se calcula en el cliente para mostrar tareas vencidas en rojo.

## Product

- El profesor entra con su contraseña, selecciona 1A–6A y crea, edita o elimina tareas con actividad y fecha de presentación.
- Cada estudiante entra con la contraseña de su curso y solo ve las tareas de ese curso.
- Las tareas futuras se muestran en verde y las vencidas en rojo; los estudiantes pueden activar recordatorios del navegador.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

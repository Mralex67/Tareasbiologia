# Publicar Tareas con Supabase y Vercel

## 1. Crear las tablas en Supabase

1. Abre el proyecto de Supabase.
2. Entra a **SQL Editor** y crea una consulta nueva.
3. Copia y ejecuta todo el contenido de `supabase/migrations/20260910000000_create_tasks.sql`.
4. Comprueba en **Table Editor** que exista `public.tasks` y que aparezcan las tareas exportadas.

La aplicación no consulta Supabase desde el navegador. El flujo es:

```text
navegador → API de Vercel → Supabase
```

Por eso la `service_role` nunca debe colocarse en el frontend.

## 2. Importar el repositorio en Vercel

1. En Vercel selecciona **Add New Project** y elige `Mralex67/Tareasbiologia`.
2. Mantén la raíz del proyecto en `/`.
3. El archivo `vercel.json` ya define el build de la web, el directorio de salida y la función `/api`.
4. En **Environment Variables**, agrega para Production, Preview y Development:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role`, solo para el servidor |
| `SESSION_SECRET` | valor largo y aleatorio |
| `TAREAS_TEACHER_PASSWORD` | contraseña del profesor |
| `TAREAS_PASSWORD_1A` a `TAREAS_PASSWORD_6A` | contraseña de cada curso |

`SUPABASE_DATABASE_URL` solo se necesita para administrar el esquema desde SQL o migraciones; no se debe publicar en el navegador.

## 3. Verificación

Después del deploy:

- `https://TU-DOMINIO.vercel.app/api/healthz` debe responder `{"status":"ok"}`.
- Inicia sesión como profesor y verifica que aparezcan las tareas importadas.
- Crea una tarea de prueba, recarga la página y confirma que persista.

Si se publica sin `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, la API intentará usar el PostgreSQL de desarrollo de Replit como fallback local; en Vercel deben estar definidas las dos variables para usar Supabase.
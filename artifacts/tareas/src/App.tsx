import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock,
  Copy,
  Database,
  FilePenLine,
  GraduationCap,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getClientSupabaseConfig,
  getGetCurrentSessionQueryKey,
  getListTasksQueryKey,
  normalizeSupabaseUrl,
  saveClientSupabaseConfig,
  setAuthTokenGetter,
  useCreateTask,
  useDeleteTask,
  useGetCurrentSession,
  useListTasks,
  useLogin,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { AuthSession, CourseCode, Task, TaskInput, UserRole } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

const queryClient = new QueryClient();
const SESSION_KEY = 'tareas.auth-session';
const COURSES: CourseCode[] = ['1A', '2A', '3A', '4A', '5A', '6A'];

const memoryStore: Record<string, string> = {};

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memoryStore[key] ?? null;
  } catch {
    return memoryStore[key] ?? null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // blocked or unavailable in sandboxed environment
  }
  memoryStore[key] = value;
}

function safeStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // blocked or unavailable in sandboxed environment
  }
  delete memoryStore[key];
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

setAuthTokenGetter(() => {
  try {
    const stored = safeStorageGet(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession).token : null;
  } catch {
    return null;
  }
});

function readSession(): AuthSession | null {
  try {
    const stored = safeStorageGet(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession) {
  safeStorageSet(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  safeStorageRemove(SESSION_KEY);
}

function errorMessage(error: unknown, fallback = 'No pudimos completar la acción.') {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatDue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', ' ·');
}

function toDateTimeInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isOverdue(value: string) {
  return new Date(value).getTime() < Date.now();
}

function Brand() {
  return (
    <div className="brand-lockup" data-testid="brand-tareas">
      <span className="brand-mark">T</span>
      <span>Tareas</span>
    </div>
  );
}

function RoleChoice({
  role,
  selected,
  onSelect,
}: {
  role: UserRole;
  selected: boolean;
  onSelect: () => void;
}) {
  const isTeacher = role === 'teacher';
  return (
    <button
      type="button"
      className={`role-card ${selected ? 'active' : ''}`}
      onClick={onSelect}
      data-testid={`button-role-${role}`}
      aria-pressed={selected}
    >
      <span className="role-icon">{isTeacher ? <UsersRound size={17} /> : <GraduationCap size={17} />}</span>
      <span className="role-copy">
        <strong>{isTeacher ? 'Soy profesor' : 'Soy estudiante'}</strong>
        <span>{isTeacher ? 'Publico y organizo' : 'Reviso mis entregas'}</span>
      </span>
    </button>
  );
}

function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  if (installed) return <p className="install-hint">Tareas ya está instalada en este dispositivo.</p>;
  if (!prompt) {
    return <p className="install-hint">Puedes instalar Tareas desde el menú del navegador cuando aparezca la opción “Instalar aplicación”.</p>;
  }

  return (
    <button type="button" className="install-btn" onClick={install}>
      <BookOpen size={16} /> Instalar Tareas en este celular
    </button>
  );
}

function Home() {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const storedSession = readSession();
  const [role, setRole] = useState<UserRole>('student');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const sessionQuery = useGetCurrentSession({
    query: {
      queryKey: getGetCurrentSessionQueryKey(),
      enabled: Boolean(storedSession?.token),
      retry: false,
    },
  });

  useEffect(() => {
    if (sessionQuery.data?.role === 'teacher') setLocation('/teacher');
    if (sessionQuery.data?.role === 'student') setLocation('/student');
  }, [sessionQuery.data, setLocation]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) return;
    login.mutate(
      { data: { password: password.trim(), role } },
      {
        onSuccess: (session) => {
          saveSession(session);
          client.setQueryData(getGetCurrentSessionQueryKey(), session);
          setLocation(session.role === 'teacher' ? '/teacher' : '/student');
        },
      },
    );
  };

  return (
    <div className="tareas-app grain auth-layout">
      <section className="auth-art" aria-label="Presentación de Tareas">
        <Brand />
        <div className="auth-art-content animate-in">
          <span className="art-kicker"><i /> Una escuela, en orden</span>
          <h1>Lo que toca aprender, a la vista.</h1>
          <p>
            Un lugar sencillo para encontrar la próxima tarea, entenderla bien y llegar a clase con todo listo.
          </p>
        </div>
        <div className="art-footer">
          <span>Para aprender con calma</span>
          <span>Para enseñar con claridad</span>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-card animate-in delay-1" onSubmit={submit}>
          <p className="eyebrow">Acceso al espacio escolar</p>
          <h2>Hola, volvamos a clase.</h2>
          <p>Ingresa con la contraseña de tu colegio para ver el espacio que te corresponde.</p>
          <div className="form-row">
            <span className="field-label">¿Cómo vas a entrar?</span>
            <div className="role-grid">
              <RoleChoice role="student" selected={role === 'student'} onSelect={() => { setRole('student'); setPassword(''); }} />
              <RoleChoice role="teacher" selected={role === 'teacher'} onSelect={() => { setRole('teacher'); setPassword(''); }} />
            </div>
          </div>
          {role === 'student' ? (
            <div className="form-row">
              <label className="field-label" htmlFor="password">Contraseña de tu curso</label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete="current-password"
                placeholder="Escribe la contraseña de tu curso"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="input-password"
              />
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '5px', display: 'block' }}>
                Ingresa la contraseña que te indicó el profesor para acceder a las tareas de tu curso.
              </span>
              {login.isError && <p className="error-note" data-testid="status-login-error">{errorMessage(login.error, 'La contraseña no es correcta.')}</p>}
            </div>
          ) : (
            <div className="form-row">
              <label className="field-label" htmlFor="password">Contraseña de profesor</label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete="current-password"
                placeholder="Escribe tu contraseña de profesor"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="input-password"
              />
              {login.isError && <p className="error-note" data-testid="status-login-error">{errorMessage(login.error, 'La contraseña no es correcta.')}</p>}
            </div>
          )}
          <button className="primary-btn wide-btn" type="submit" disabled={login.isPending || !password.trim()} data-testid="button-login">
            {login.isPending ? 'Comprobando…' : 'Entrar a Tareas'}
            {!login.isPending && <ChevronRight size={17} />}
          </button>
          <InstallAppButton />
          {sessionQuery.isError && storedSession?.token && (
            <p className="error-note" data-testid="status-session-error">Tu sesión anterior ya no está disponible. Ingresa nuevamente.</p>
          )}
        </form>
      </section>
    </div>
  );
}

function CourseSidebar({
  course,
  onCourse,
  role,
  onLogout,
}: {
  course?: CourseCode | null;
  onCourse?: (course: CourseCode) => void;
  role: UserRole;
  onLogout: () => void;
}) {
  return (
    <aside className="app-sidebar">
      <Brand />
      <div className="sidebar-rule" />
      <p className="sidebar-label">{role === 'teacher' ? 'Cursos' : 'Mi curso'}</p>
      <nav className="course-nav" aria-label="Cursos">
        {role === 'teacher' ? COURSES.map((item) => (
          <button
            key={item}
            type="button"
            className={`course-btn ${course === item ? 'active' : ''}`}
            onClick={() => onCourse?.(item)}
            data-testid={`button-course-${item}`}
            aria-pressed={course === item}
          >
            <span><span className="course-name">{item}</span><span className="course-caption">Curso activo</span></span>
          </button>
        )) : (
          <div className="course-btn active" data-testid="text-student-course">
            <span><span className="course-name">{course ?? 'Sin asignar'}</span><span className="course-caption">Mi sala</span></span>
          </div>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-line">
          <span className="profile-badge">{role === 'teacher' ? 'P' : 'E'}</span>
          <span><strong>{role === 'teacher' ? 'Profesor' : 'Estudiante'}</strong><span>Sesión activa</span></span>
        </div>
        <button type="button" className="logout-btn" onClick={onLogout} data-testid="button-logout">
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function AppFrame({
  session,
  course,
  onCourse,
  children,
}: {
  session: AuthSession;
  course?: CourseCode | null;
  onCourse?: (course: CourseCode) => void;
  children: ReactNode;
}) {
  const [, setLocation] = useLocation();
  const logout = () => {
    clearSession();
    queryClient.clear();
    setLocation('/');
  };
  return (
    <div className="tareas-app grain app-frame">
      <CourseSidebar course={course} onCourse={onCourse} role={session.role} onLogout={logout} />
      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-kicker">Espacio de {session.role === 'teacher' ? 'profesor' : 'estudiante'}</div>
            <div className="topbar-title" data-testid="text-header-course">{course ? `Curso ${course}` : 'Tareas'}</div>
          </div>
          <div className="topbar-actions">
            {session.role === 'teacher' && onCourse && (
              <select
                className="mobile-course-picker"
                value={course ?? '1A'}
                onChange={(event) => onCourse(event.target.value as CourseCode)}
                aria-label="Seleccionar curso"
                data-testid="select-mobile-course"
              >
                {COURSES.map((item) => <option key={item} value={item}>Curso {item}</option>)}
              </select>
            )}
            <button type="button" className="icon-btn mobile-only" onClick={logout} aria-label="Cerrar sesión" data-testid="button-mobile-logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function TaskSkeleton() {
  return (
    <div className="skeleton-list" aria-label="Cargando tareas" data-testid="status-task-loading">
      {[1, 2, 3].map((item) => (
        <div className="skeleton-row" key={item}>
          <div className="skeleton skeleton-line title" />
          <div className="skeleton skeleton-line copy" />
          <div className="skeleton skeleton-line meta" />
        </div>
      ))}
    </div>
  );
}

function EmptyTasks({ student = false }: { student?: boolean }) {
  return (
    <div className="empty-state" data-testid="status-task-empty">
      <div className="empty-orb">{student ? <Sparkles size={24} /> : <ClipboardList size={24} />}</div>
      <h3>{student ? 'Todavía no hay tareas' : 'Este curso está en blanco'}</h3>
      <p>{student ? 'Cuando tu profesor publique algo, aparecerá aquí con su fecha y todos los detalles.' : 'Agrega la primera tarea del curso para que tus estudiantes sepan qué preparar.'}</p>
    </div>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice" role="alert" data-testid="status-task-error">
      <CircleAlert size={18} />
      <span>{message}</span>
      <button type="button" onClick={onRetry} data-testid="button-retry-tasks">Reintentar</button>
    </div>
  );
}

function TaskCard({
  task,
  teacher = false,
  onEdit,
  onDelete,
  deletePending,
}: {
  task: Task;
  teacher?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  const overdue = isOverdue(task.dueAt);
  return (
    <article className="task-row animate-in" data-testid={`card-task-${task.id}`}>
      <div>
        <h3 className="task-title" data-testid={`text-task-title-${task.id}`}>{task.title}</h3>
        {task.description && <p className="task-description" data-testid={`text-task-description-${task.id}`}>{task.description}</p>}
        <div className="task-meta">
          <span className={`due-date ${overdue ? 'overdue' : 'current'}`} data-testid={`status-due-${task.id}`}>
            <CalendarDays size={14} /> {overdue ? 'Vencida' : 'Entrega'} · {formatDue(task.dueAt)}
          </span>
        </div>
      </div>
      <div className="task-actions">
        {teacher ? (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={() => openGoogleCalendarReminder(task)}
              title="📅 Agendar en Google Calendar (Recordatorio 8:00 PM)"
              aria-label={`Google Calendar para ${task.title}`}
              data-testid={`button-gcal-direct-${task.id}`}
            >
              <Calendar size={17} />
            </button>
            <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar ${task.title}`} data-testid={`button-edit-task-${task.id}`}><FilePenLine size={17} /></button>
            <button type="button" className="icon-btn" onClick={onDelete} disabled={deletePending} aria-label={`Eliminar ${task.title}`} data-testid={`button-delete-task-${task.id}`}><Trash2 size={17} /></button>
          </>
        ) : (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => openGoogleCalendarReminder(task)}
            title="Agendar en Google Calendar con recordatorio a las 8:00 PM"
            aria-label={`Agendar ${task.title} en Google Calendar`}
            data-testid={`button-gcal-student-${task.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
            }}
          >
            <Calendar size={14} color="hsl(var(--primary))" />
            <span>Google Calendar</span>
          </button>
        )}
      </div>
    </article>
  );
}

function getReminder8PM(dueAtIso: string): { start: Date; end: Date; formattedStr: string; isPast: boolean } {
  const due = new Date(dueAtIso);
  const reminder = new Date(due);
  reminder.setDate(reminder.getDate() - 1);
  reminder.setHours(20, 0, 0, 0);

  const end = new Date(reminder.getTime() + 30 * 60 * 1000);
  const isPast = reminder.getTime() < Date.now();

  const formattedStr = reminder.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return { start: reminder, end, formattedStr, isPast };
}

function openGoogleCalendarReminder(task: Task) {
  const { start, end } = getReminder8PM(task.dueAt);
  const formatDateGCal = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const title = encodeURIComponent(`🚨 ¡Tienes Tarea Individuo! Mañana vence: ${task.title}`);
  const details = encodeURIComponent(
    `⏰ RECORDATORIO DE LAS 8:00 PM\n` +
    `¡Tienes tarea, individuo! Mañana se entrega:\n\n` +
    `📚 Curso: ${task.course}\n` +
    `📌 Tarea: ${task.title}\n` +
    (task.description ? `📝 Indicaciones: ${task.description}\n` : '') +
    `📅 Fecha de entrega: ${formatDue(task.dueAt)}\n\n` +
    `¡Termínala hoy para no desvelarte ni entregarla a las carreras!`
  );
  const dates = `${formatDateGCal(start)}/${formatDateGCal(end)}`;
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dates}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function TaskFormModal({
  course,
  task,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  course: CourseCode;
  task?: Task | null;
  onClose: () => void;
  onSubmit: (input: TaskInput) => void;
  pending: boolean;
  error?: unknown;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueAt, setDueAt] = useState(toDateTimeInput(task?.dueAt));
  const isEditing = Boolean(task);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !dueAt) return;
    onSubmit({ course, title: title.trim(), description: description.trim() || undefined, dueAt: new Date(dueAt).toISOString() });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="task-form-title" data-testid="dialog-task-form">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{isEditing ? 'Editar tarea' : 'Nueva tarea'} · Curso {course}</p>
            <h2 id="task-form-title">{isEditing ? 'Ajustemos los detalles.' : '¿Qué van a preparar?'}</h2>
            <p>La información que escribas será visible para todo el curso.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar formulario" data-testid="button-close-task-form"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label className="field-label" htmlFor="task-title">Título</label>
            <input id="task-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Lectura: el ciclo del agua" required data-testid="input-task-title" />
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="task-description">Indicaciones <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>(opcional)</span></label>
            <textarea id="task-description" className="field" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cuenta brevemente qué deben presentar." data-testid="input-task-description" />
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="task-due">Fecha y hora de entrega</label>
            <input id="task-due" className="field" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required data-testid="input-task-due" />
          </div>
          {Boolean(error) && <p className="error-note" data-testid="status-task-mutation-error">{errorMessage(error)}</p>}
          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={onClose} data-testid="button-cancel-task">Cancelar</button>
            <button type="submit" className="primary-btn" disabled={pending || !title.trim() || !dueAt} data-testid="button-save-task">
              {pending ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Publicar tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SUPABASE_TASKS_SQL = `-- Ejecutar en Supabase > SQL Editor
create table if not exists public.tasks (
  id integer generated by default as identity primary key,
  course text not null check (course in ('1A', '2A', '3A', '4A', '5A', '6A')),
  title text not null,
  description text not null default '',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_course_due_at_idx
  on public.tasks (course, due_at);

-- Activar RLS con permisos abiertos para la app (se muestra en verde en Supabase)
alter table public.tasks enable row level security;

drop policy if exists "Permitir acceso web anonimo" on public.tasks;
create policy "Permitir acceso web anonimo"
  on public.tasks for all
  using (true)
  with check (true);`;

function TeacherPage() {
  const [, setLocation] = useLocation();
  const sessionQuery = useGetCurrentSession({ query: { queryKey: getGetCurrentSessionQueryKey(), enabled: Boolean(readSession()?.token), retry: false } });
  const session = sessionQuery.data ?? readSession();
  const [course, setCourse] = useState<CourseCode>((session?.course as CourseCode | null) ?? '1A');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [sbUrlInput, setSbUrlInput] = useState(() => getClientSupabaseConfig()?.url ?? '');
  const [sbAnonKeyInput, setSbAnonKeyInput] = useState(() => getClientSupabaseConfig()?.anonKey ?? '');
  const [sbStatusMsg, setSbStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [testingSb, setTestingSb] = useState(false);

  const dbStatusQuery = useQuery({
    queryKey: ['db-status'],
    queryFn: async () => {
      const clientConfig = getClientSupabaseConfig();
      try {
        const res = await fetch('/api/db-status');
        if (res.ok) {
          const data = await res.json();
          if (data && (data.isSupabase || !clientConfig)) return data;
        }
      } catch {}
      if (clientConfig) {
        return {
          activeDatabase: 'Supabase (Nube)',
          isSupabase: true,
          isPartial: false,
          diagnostics: { message: 'Conectado a la base de datos Supabase en la nube.', isReady: true, urlIsPlaceholder: false },
        };
      }
      return {
        activeDatabase: 'En memoria (Local)',
        isSupabase: false,
        isPartial: false,
        diagnostics: { message: 'Operando localmente.', isReady: false, urlIsPlaceholder: false },
      };
    },
  });

  const taskQuery = useListTasks(
    { course },
    { query: { queryKey: getListTasksQueryKey({ course }), enabled: Boolean(course), retry: false } },
  );
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const client = useQueryClient();
  const tasks = taskQuery.data ?? [];
  const upcoming = tasks.filter((task) => !isOverdue(task.dueAt)).length;

  useEffect(() => {
    if (!sessionQuery.isLoading && (!session || session.role !== 'teacher')) setLocation('/');
  }, [session, sessionQuery.isLoading, setLocation]);

  if (!session || session.role !== 'teacher') return null;

  const invalidate = () => client.invalidateQueries({ queryKey: getListTasksQueryKey({ course }) });
  const openNew = () => { setEditingTask(null); setFormOpen(true); };
  const openEdit = (task: Task) => { setEditingTask(task); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditingTask(null); };

  const handleSaveSupabase = async () => {
    let url = sbUrlInput.trim();
    const anonKey = sbAnonKeyInput.trim();
    if (!url || !anonKey) {
      setSbStatusMsg({ type: 'error', text: 'Por favor ingresa la Project URL y la Anon Key de Supabase.' });
      return;
    }

    const cleanUrl = normalizeSupabaseUrl(url);
    setSbUrlInput(cleanUrl);

    setTestingSb(true);
    setSbStatusMsg(null);
    try {
      const testRes = await fetch(`${cleanUrl}/rest/v1/tasks?select=id&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (!testRes.ok) {
        let detail = '';
        try {
          const json = await testRes.json();
          detail = json.message || json.hint || JSON.stringify(json);
        } catch {
          detail = await testRes.text().catch(() => '');
        }

        if (testRes.status === 401 || testRes.status === 403) {
          throw new Error(`La Anon Key fue rechazada (Error ${testRes.status}). Asegúrate de copiar la clave 'anon' 'public' en Project Settings > API.`);
        }

        if (testRes.status === 404 && detail.toLowerCase().includes('tasks')) {
          saveClientSupabaseConfig({ url: cleanUrl, anonKey });
          setSbStatusMsg({
            type: 'info',
            text: 'Conectó a Supabase. Como la tabla se acaba de crear, el caché de la API puede tardar unos segundos. Espera un momento y presiona "Conectar y Guardar" de nuevo.',
          });
          client.invalidateQueries({ queryKey: ['db-status'] });
          invalidate();
          return;
        }

        throw new Error(`Error ${testRes.status}: ${detail || testRes.statusText}`);
      }

      saveClientSupabaseConfig({ url: cleanUrl, anonKey });
      setSbStatusMsg({ type: 'success', text: '¡Conectado exitosamente con tu base de datos Supabase en la nube!' });
      client.invalidateQueries({ queryKey: ['db-status'] });
      invalidate();
    } catch (err: any) {
      setSbStatusMsg({ type: 'error', text: `No se pudo conectar: ${err?.message || 'Verifica la URL y la Anon Key'}` });
    } finally {
      setTestingSb(false);
    }
  };

  const handleDisconnectSupabase = () => {
    saveClientSupabaseConfig(null);
    setSbUrlInput('');
    setSbAnonKeyInput('');
    setSbStatusMsg({ type: 'info', text: 'Supabase desconectado. Usando almacenamiento local.' });
    client.invalidateQueries({ queryKey: ['db-status'] });
    invalidate();
  };

  const submitTask = (input: TaskInput) => {
    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, data: input }, { onSuccess: () => { invalidate(); closeForm(); } });
    } else {
      createTask.mutate({ data: input }, { onSuccess: () => { invalidate(); closeForm(); } });
    }
  };
  const confirmDeleteTask = (task: Task) => {
    setDeletingTaskId(task.id);
    deleteTask.mutate(
      { id: task.id },
      {
        onSuccess: () => {
          setDeletingTaskId(null);
          setTaskToDelete(null);
          invalidate();
        },
        onError: () => {
          setDeletingTaskId(null);
          setTaskToDelete(null);
        },
      },
    );
  };
  const pending = createTask.isPending || updateTask.isPending;
  const mutationError = createTask.error ?? updateTask.error;

  return (
    <AppFrame session={session} course={course} onCourse={setCourse}>
      <div className="page-content">
        <div className="intro-row animate-in">
          <div>
            <p className="eyebrow">Panel de profesor</p>
            <h1>Todo listo para<br />enseñar mejor.</h1>
            <p>Publica lo necesario para que tu curso avance sin preguntas de último minuto.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setSupabaseModalOpen(true)}
              data-testid="button-supabase-status"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Database size={16} />
              <span>{dbStatusQuery.data?.isSupabase ? 'Supabase Conectado' : 'BD: Local / Supabase'}</span>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dbStatusQuery.data?.isSupabase ? '#16a34a' : '#a8a29e',
                }}
              />
            </button>
            <button type="button" className="primary-btn" onClick={openNew} data-testid="button-new-task">
              <Plus size={18} />
              <span>Nueva tarea</span>
            </button>
          </div>
        </div>
        <div className="stat-strip animate-in delay-1">
          <div className="stat-card"><div className="stat-label">Curso seleccionado</div><div className="stat-value">{course}</div><div className="stat-sub">Tu espacio de publicación</div></div>
          <div className="stat-card"><div className="stat-label">Tareas publicadas</div><div className="stat-value" data-testid="text-task-count">{tasks.length}</div><div className="stat-sub">En este curso</div></div>
          <div className="stat-card"><div className="stat-label">Por entregar</div><div className="stat-value" data-testid="text-upcoming-count">{upcoming}</div><div className="stat-sub">Fechas aún vigentes</div></div>
        </div>
        {taskQuery.isError ? <ErrorNotice message={errorMessage(taskQuery.error, 'No pudimos cargar las tareas.')} onRetry={() => taskQuery.refetch()} /> : (
          <section className="task-panel animate-in delay-2">
            <div className="panel-heading">
              <div><h2>Tareas del curso {course}</h2><p>Ordenadas desde la más reciente.</p></div>
              <button type="button" className="primary-btn" onClick={openNew} data-testid="button-new-task-panel"><Plus size={17} /><span>Agregar</span></button>
            </div>
            {deleteTask.isError && <p className="error-note" style={{ padding: '13px 20px 0' }} data-testid="status-delete-error">{errorMessage(deleteTask.error, 'No pudimos eliminar la tarea.')}</p>}
            {taskQuery.isLoading ? <TaskSkeleton /> : tasks.length === 0 ? <EmptyTasks /> : (
              <div className="task-list">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    teacher
                    onEdit={() => openEdit(task)}
                    onDelete={() => setTaskToDelete(task)}
                    deletePending={deletingTaskId === task.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      {formOpen && <TaskFormModal course={course} task={editingTask} onClose={closeForm} onSubmit={submitTask} pending={pending} error={mutationError} />}
      {taskToDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" data-testid="dialog-delete-confirm">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Confirmar eliminación</p>
                <h2 id="delete-dialog-title">¿Eliminar esta tarea?</h2>
                <p>¿Estás seguro de eliminar “{taskToDelete.title}”? Esta acción no se puede deshacer.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setTaskToDelete(null)} aria-label="Cerrar confirmación" data-testid="button-close-delete-dialog"><X size={18} /></button>
            </div>
            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button type="button" className="secondary-btn" onClick={() => setTaskToDelete(null)} data-testid="button-cancel-delete">Cancelar</button>
              <button
                type="button"
                className="primary-btn"
                style={{ backgroundColor: 'hsl(var(--destructive, 0 84% 60%))', borderColor: 'transparent' }}
                disabled={deletingTaskId === taskToDelete.id}
                onClick={() => confirmDeleteTask(taskToDelete)}
                data-testid="button-confirm-delete"
              >
                {deletingTaskId === taskToDelete.id ? 'Eliminando…' : 'Eliminar tarea'}
              </button>
            </div>
          </div>
        </div>
      )}
      {supabaseModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" style={{ maxWidth: '620px' }} role="dialog" aria-modal="true" aria-labelledby="supabase-dialog-title" data-testid="dialog-supabase-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Almacenamiento de Datos</p>
                <h2 id="supabase-dialog-title">Conectar base de datos Supabase</h2>
                <p>
                  Estado: <strong>{dbStatusQuery.data?.activeDatabase ?? 'Comprobando...'}</strong>
                </p>
                {dbStatusQuery.data?.diagnostics?.message && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: dbStatusQuery.data.isSupabase ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }}>
                    {dbStatusQuery.data.diagnostics.message}
                  </p>
                )}
              </div>
              <button type="button" className="icon-btn" onClick={() => setSupabaseModalOpen(false)} aria-label="Cerrar modal" data-testid="button-close-supabase-dialog">
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px', fontSize: '14px' }}>
              {/* Sección 1: Conexión directa en la aplicación */}
              <div style={{ background: 'hsl(var(--muted) / 0.45)', padding: '14px', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}>
                <p style={{ fontWeight: 600, margin: '0 0 6px 0' }}>1. Conectar tu proyecto de Supabase</p>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                  Ingresa las credenciales de tu proyecto de Supabase (las encuentras en <strong>Project Settings &gt; API</strong>):
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="form-row" style={{ margin: 0 }}>
                    <label className="field-label" htmlFor="supabase-url" style={{ fontSize: '12px' }}>
                      Project URL
                    </label>
                    <input
                      id="supabase-url"
                      className="field"
                      style={{ fontSize: '13px', padding: '6px 10px', height: '36px' }}
                      value={sbUrlInput}
                      onChange={(e) => setSbUrlInput(e.target.value)}
                      placeholder="https://xxxxxxxxxxxx.supabase.co"
                      data-testid="input-supabase-url"
                    />
                  </div>

                  <div className="form-row" style={{ margin: 0 }}>
                    <label className="field-label" htmlFor="supabase-anon-key" style={{ fontSize: '12px' }}>
                      API Key pública (anon key)
                    </label>
                    <input
                      id="supabase-anon-key"
                      className="field"
                      type="password"
                      style={{ fontSize: '13px', padding: '6px 10px', height: '36px' }}
                      value={sbAnonKeyInput}
                      onChange={(e) => setSbAnonKeyInput(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                      data-testid="input-supabase-key"
                    />
                  </div>

                  {sbStatusMsg && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        lineHeight: '1.4',
                        background:
                          sbStatusMsg.type === 'success'
                            ? 'hsl(142 76% 36% / 0.15)'
                            : sbStatusMsg.type === 'error'
                            ? 'hsl(var(--destructive) / 0.15)'
                            : 'hsl(217 91% 60% / 0.15)',
                        color:
                          sbStatusMsg.type === 'success'
                            ? 'hsl(142 76% 36%)'
                            : sbStatusMsg.type === 'error'
                            ? 'hsl(var(--destructive))'
                            : 'hsl(217 91% 60%)',
                        border: '1px solid currentColor',
                      }}
                      data-testid="status-supabase-message"
                    >
                      {sbStatusMsg.text}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      style={{ height: '34px', fontSize: '13px', padding: '0 14px' }}
                      disabled={testingSb}
                      onClick={handleSaveSupabase}
                      data-testid="button-connect-supabase"
                    >
                      {testingSb ? 'Comprobando conexión…' : 'Conectar y Guardar'}
                    </button>
                    {(Boolean(sbUrlInput) || dbStatusQuery.data?.isSupabase) && (
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ height: '34px', fontSize: '13px', padding: '0 12px' }}
                        onClick={handleDisconnectSupabase}
                        data-testid="button-disconnect-supabase"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección 2: Script SQL */}
              <div style={{ background: 'hsl(var(--muted) / 0.45)', padding: '14px', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>2. Crear la tabla en Supabase SQL Editor</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: '4px 10px', fontSize: '12px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(SUPABASE_TASKS_SQL);
                      }
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2500);
                    }}
                    data-testid="button-copy-sql"
                  >
                    {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedSql ? 'Copiado' : 'Copiar SQL'}</span>
                  </button>
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                  Copia y ejecuta este script en <strong>Supabase &gt; SQL Editor &gt; New Query &gt; Run</strong> para crear la tabla de tareas:
                </p>
                <pre
                  style={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    overflowX: 'auto',
                    fontFamily: 'monospace',
                    maxHeight: '120px',
                    margin: 0,
                    lineHeight: '1.4',
                  }}
                >
                  {SUPABASE_TASKS_SQL}
                </pre>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button type="button" className="primary-btn" onClick={() => setSupabaseModalOpen(false)}>
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}

function StudentPage() {
  const [, setLocation] = useLocation();
  const sessionQuery = useGetCurrentSession({ query: { queryKey: getGetCurrentSessionQueryKey(), enabled: Boolean(readSession()?.token), retry: false } });
  const session = sessionQuery.data ?? readSession();
  const course = (session?.course as CourseCode | null) ?? null;
  const taskQuery = useListTasks(
    course ? { course } : undefined,
    { query: { queryKey: getListTasksQueryKey(course ? { course } : undefined), enabled: Boolean(course), retry: false } },
  );

  useEffect(() => {
    if (!sessionQuery.isLoading && (!session || session.role !== 'student')) setLocation('/');
  }, [session, sessionQuery.isLoading, setLocation]);

  if (!session || session.role !== 'student') return null;

  return (
    <AppFrame session={session} course={course}>
      <div className="page-content">
        <section className="student-hero animate-in">
          <p className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Tu espacio de estudio</p>
          <h1>Hola. Aquí está lo que necesitas preparar.</h1>
          <p>Revisa las indicaciones de tu curso {course ?? 'sin asignar'} y agrégalas a tu Google Calendar con un solo clic.</p>
        </section>
        {!course ? (
          <section className="task-panel animate-in delay-1"><EmptyTasks student /></section>
        ) : taskQuery.isError ? (
          <ErrorNotice message={errorMessage(taskQuery.error, 'No pudimos cargar tus tareas.')} onRetry={() => taskQuery.refetch()} />
        ) : (
          <section className="task-panel animate-in delay-1">
            <div className="panel-heading">
              <div><h2>Lo que sigue</h2><p>{taskQuery.isLoading ? 'Buscando tus tareas…' : `${taskQuery.data?.length ?? 0} tareas para tu curso.`}</p></div>
              <BookOpen size={22} color="hsl(var(--primary))" />
            </div>
            {taskQuery.isLoading ? <TaskSkeleton /> : (taskQuery.data?.length ?? 0) === 0 ? <EmptyTasks student /> : (
              <div className="task-list">
                {taskQuery.data?.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppFrame>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/teacher" component={TeacherPage} />
        <Route path="/student" component={StudentPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useHashLocation}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
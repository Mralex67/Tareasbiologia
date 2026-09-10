import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
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
  getGetCurrentSessionQueryKey,
  getListTasksQueryKey,
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

const queryClient = new QueryClient();
const SESSION_KEY = 'tareas.auth-session';
const REMINDER_KEY = 'tareas.reminders';
const COURSES: CourseCode[] = ['1A', '2A', '3A', '4A', '5A', '6A'];

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

setAuthTokenGetter(() => {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession).token : null;
  } catch {
    return null;
  }
});

function readSession(): AuthSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
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
              <RoleChoice role="student" selected={role === 'student'} onSelect={() => setRole('student')} />
              <RoleChoice role="teacher" selected={role === 'teacher'} onSelect={() => setRole('teacher')} />
            </div>
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete="current-password"
              placeholder="Escribe la contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="input-password"
            />
            {login.isError && <p className="error-note" data-testid="status-login-error">{errorMessage(login.error, 'La contraseña no es correcta.')}</p>}
          </div>
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
  reminderActive,
  onReminder,
}: {
  task: Task;
  teacher?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
  reminderActive?: boolean;
  onReminder?: () => void;
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
            <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar ${task.title}`} data-testid={`button-edit-task-${task.id}`}><FilePenLine size={17} /></button>
            <button type="button" className="icon-btn" onClick={onDelete} disabled={deletePending} aria-label={`Eliminar ${task.title}`} data-testid={`button-delete-task-${task.id}`}><Trash2 size={17} /></button>
          </>
        ) : (
          <button type="button" className={`reminder-btn ${reminderActive ? 'active' : ''}`} onClick={onReminder} data-testid={`button-reminder-task-${task.id}`}>
            {reminderActive ? <BellRing size={14} /> : <Bell size={14} />}
            {reminderActive ? 'Recordatorio activo' : 'Recordarme'}
          </button>
        )}
      </div>
    </article>
  );
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

function TeacherPage() {
  const [, setLocation] = useLocation();
  const sessionQuery = useGetCurrentSession({ query: { queryKey: getGetCurrentSessionQueryKey(), enabled: Boolean(readSession()?.token), retry: false } });
  const session = sessionQuery.data ?? readSession();
  const [course, setCourse] = useState<CourseCode>((session?.course as CourseCode | null) ?? '1A');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
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
  const submitTask = (input: TaskInput) => {
    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, data: input }, { onSuccess: () => { invalidate(); closeForm(); } });
    } else {
      createTask.mutate({ data: input }, { onSuccess: () => { invalidate(); closeForm(); } });
    }
  };
  const removeTask = (task: Task) => {
    if (!window.confirm(`¿Eliminar “${task.title}”? Esta acción no se puede deshacer.`)) return;
    setDeletingTaskId(task.id);
    deleteTask.mutate({ id: task.id }, { onSuccess: () => { setDeletingTaskId(null); invalidate(); }, onError: () => setDeletingTaskId(null) });
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
          <button type="button" className="primary-btn" onClick={openNew} data-testid="button-new-task"><Plus size={18} /><span>Nueva tarea</span></button>
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
              <div className="task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} teacher onEdit={() => openEdit(task)} onDelete={() => removeTask(task)} deletePending={deletingTaskId === task.id} />)}</div>
            )}
          </section>
        )}
      </div>
      {formOpen && <TaskFormModal course={course} task={editingTask} onClose={closeForm} onSubmit={submitTask} pending={pending} error={mutationError} />}
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
  const [reminders, setReminders] = useState<Record<number, number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(REMINDER_KEY) ?? '{}') as Record<string, number> | number[];
      if (Array.isArray(stored)) return Object.fromEntries(stored.map((id) => [id, Date.now()]));
      return Object.fromEntries(Object.entries(stored).map(([id, at]) => [Number(id), at]));
    } catch {
      return {};
    }
  });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionQuery.isLoading && (!session || session.role !== 'student')) setLocation('/');
  }, [session, sessionQuery.isLoading, setLocation]);

  const persistReminders = (next: Record<number, number>) => {
    setReminders(next);
    localStorage.setItem(REMINDER_KEY, JSON.stringify(next));
  };

  const notifyTask = (task: Task) => {
    try {
      new Notification('Tareas', { body: `Mañana tienes tarea: ${task.title}` });
      setNotice(`Aviso enviado: mañana tienes “${task.title}”.`);
    } catch {
      setNotice('El recordatorio está guardado, pero el navegador no pudo mostrarlo.');
    }
    const next = { ...reminders };
    delete next[task.id];
    persistReminders(next);
  };

  useEffect(() => {
    const timers = (taskQuery.data ?? []).flatMap((task) => {
      const reminderAt = reminders[task.id];
      if (!reminderAt) return [];
      return [window.setTimeout(() => notifyTask(task), Math.max(0, reminderAt - Date.now()))];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [taskQuery.data, reminders]);

  if (!session || session.role !== 'student') return null;

  const toggleReminder = async (task: Task) => {
    if (reminders[task.id]) {
      const next = { ...reminders };
      delete next[task.id];
      persistReminders(next);
      setNotice('Recordatorio desactivado.');
      return;
    }
    if (!('Notification' in window)) {
      setNotice('Tu navegador no permite notificaciones. Puedes volver a revisar esta página cuando quieras.');
      return;
    }
    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotice('Las notificaciones están bloqueadas en tu navegador. Actívalas desde la configuración para usar recordatorios.');
        return;
      }
      const dueAt = new Date(task.dueAt).getTime();
      const reminderAt = Math.max(Date.now(), dueAt - 24 * 60 * 60 * 1000);
      persistReminders({ ...reminders, [task.id]: reminderAt });
      setNotice(`Recordatorio activo para ${formatDue(new Date(reminderAt).toISOString())}.`);
    } catch {
      setNotice('No pudimos activar notificaciones en este navegador. Revisa sus permisos para continuar.');
    }
  };

  return (
    <AppFrame session={session} course={course}>
      <div className="page-content">
        <section className="student-hero animate-in">
          <p className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Tu espacio de estudio</p>
          <h1>Hola. Aquí está lo que necesitas preparar.</h1>
          <p>Revisa con calma las indicaciones de tu curso {course ?? 'sin asignar'} y activa un recordatorio cuando no quieras olvidarlo.</p>
        </section>
        {notice && <div className="notice success animate-in" role="status" data-testid="status-reminder-notice"><Check size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso" data-testid="button-close-notice"><X size={15} /></button></div>}
        {!course ? (
          <section className="task-panel animate-in delay-1"><EmptyTasks student /></section>
        ) : taskQuery.isError ? (
          <ErrorNotice message={errorMessage(taskQuery.error, 'No pudimos cargar tus tareas.')} onRetry={() => taskQuery.refetch()} />
        ) : (
          <section className="task-panel animate-in delay-1" style={{ marginTop: notice ? 18 : 0 }}>
            <div className="panel-heading">
              <div><h2>Lo que sigue</h2><p>{taskQuery.isLoading ? 'Buscando tus tareas…' : `${taskQuery.data?.length ?? 0} tareas para tu curso.`}</p></div>
              <BookOpen size={22} color="hsl(var(--primary))" />
            </div>
            {taskQuery.isLoading ? <TaskSkeleton /> : (taskQuery.data?.length ?? 0) === 0 ? <EmptyTasks student /> : (
              <div className="task-list">{taskQuery.data?.map((task) => <TaskCard key={task.id} task={task} reminderActive={Boolean(reminders[task.id])} onReminder={() => toggleReminder(task)} />)}</div>
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
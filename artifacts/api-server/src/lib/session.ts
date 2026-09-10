import { createHmac, timingSafeEqual } from "node:crypto";

export type CourseCode = "1A" | "2A" | "3A" | "4A" | "5A" | "6A";
export type SessionRole = "teacher" | "student";
export type Session = {
  token: string;
  role: SessionRole;
  course: CourseCode | null;
};

function readPassword(name: string, developmentFallback: string): string {
  const configured = process.env[name];
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured in production.`);
  }
  return developmentFallback;
}

const coursePasswords: Record<CourseCode, string> = {
  "1A": readPassword("TAREAS_PASSWORD_1A", "dev-course-1a-password"),
  "2A": readPassword("TAREAS_PASSWORD_2A", "dev-course-2a-password"),
  "3A": readPassword("TAREAS_PASSWORD_3A", "dev-course-3a-password"),
  "4A": readPassword("TAREAS_PASSWORD_4A", "dev-course-4a-password"),
  "5A": readPassword("TAREAS_PASSWORD_5A", "dev-course-5a-password"),
  "6A": readPassword("TAREAS_PASSWORD_6A", "dev-course-6a-password"),
};

const teacherPassword = readPassword(
  "TAREAS_TEACHER_PASSWORD",
  "dev-teacher-password",
);
const sessionSecret =
  process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function makeToken(role: SessionRole, course: CourseCode | null): string {
  const payload = encode(
    JSON.stringify({
      role,
      course,
      exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
    }),
  );
  return `${payload}.${sign(payload)}`;
}

function decodeToken(token: string): Omit<Session, "token"> | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      role?: SessionRole;
      course?: CourseCode | null;
      exp?: number;
    };
    if (!parsed.role || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { role: parsed.role, course: parsed.course ?? null };
  } catch {
    return null;
  }
}

export function createSession(password: string): Session | null {
  if (password === teacherPassword) {
    const session: Session = {
      token: makeToken("teacher", null),
      role: "teacher",
      course: null,
    };
    return session;
  }

  const course = (Object.keys(coursePasswords) as CourseCode[]).find(
    (code) => coursePasswords[code] === password,
  );

  if (!course) return null;

  const session: Session = {
    token: makeToken("student", course),
    role: "student",
    course,
  };
  return session;
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  const decoded = decodeToken(token);
  return decoded ? { token, ...decoded } : null;
}
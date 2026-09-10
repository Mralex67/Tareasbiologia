# 🌿 Tareas Biología

Aplicación escolar moderna para la publicación, consulta y seguimiento de tareas escolares organizadas por cursos (1° A a 6° A), diseñada tanto para profesores como para estudiantes.

---

## 🚀 Inicio Rápido en Local

### Requisitos previos
- Node.js 20+
- npm

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar en modo desarrollo
```bash
npm run dev
```
Abre en tu navegador [http://localhost:3000](http://localhost:3000).

### 3. Compilar para producción
```bash
npm run build
npm start
```

---

## 🔑 Credenciales por Defecto

La aplicación funciona inmediatamente sin necesidad de configurar nada:

- **Profesor:**
  - Rol: *Soy profesor*
  - Contraseña: `BiologiaRamiro1`
- **Estudiantes (por curso):**
  - **1° A:** `Bolivia1`
  - **2° A:** `Bolivia2`
  - **3° A:** `Bolivia3`
  - **4° A:** `Bolivia4`
  - **5° A:** `Bolivia5`
  - **6° A:** `Bolivia6`

---

## ⚙️ Variables de Entorno (Opcional)

Si deseas personalizar las contraseñas o conectar una base de datos persistente en la nube (Supabase), crea un archivo `.env` en la raíz:

```env
# Clave para encriptar sesiones
SESSION_SECRET=tu_secreto_largo_y_seguro

# Contraseña del profesor
TAREAS_TEACHER_PASSWORD=BiologiaRamiro1

# Contraseñas de los cursos
TAREAS_PASSWORD_1A=Bolivia1
TAREAS_PASSWORD_2A=Bolivia2
TAREAS_PASSWORD_3A=Bolivia3
TAREAS_PASSWORD_4A=Bolivia4
TAREAS_PASSWORD_5A=Bolivia5
TAREAS_PASSWORD_6A=Bolivia6

# Conexión Supabase (opcional, para guardar tareas en la nube)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
SUPABASE_DATABASE_URL=postgresql://postgres:password@db.tu-proyecto.supabase.co:5432/postgres
```

---

## 🌐 Cómo Subir a GitHub y Desplegar tu Página Web

### Opción 1: Exportar directamente desde Google AI Studio
1. En el menú superior de Google AI Studio, haz clic en **Settings** (o los tres puntos `...`).
2. Selecciona **Export to GitHub** (o **Download ZIP**).
3. Sigue los pasos para vincular tu repositorio de GitHub.

### Opción 2: Subir por consola Git
```bash
git init
git add .
git commit -m "Initial commit - Tareas Biologia"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

---

## ☁️ Opciones de Despliegue (Página Web Pública)

### A. Vercel (Recomendado)
1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **Add New Project** e importa tu repositorio.
3. El archivo `vercel.json` incluido en el proyecto ya configura la compilación y las rutas `/api/*` automáticamente.
4. Si usas Supabase o contraseñas personalizadas, añade las variables de entorno en la sección **Environment Variables**.
5. Haz clic en **Deploy**. ¡Tu página web estará online con dominio `.vercel.app`!

### B. Render / Railway / Fly.io
1. Crea un nuevo **Web Service** conectado a tu repositorio de GitHub.
2. Build Command: `npm run build`
3. Start Command: `npm start`
4. Puerto: la aplicación lee automáticamente `process.env.PORT` con fallback a 3000.

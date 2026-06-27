# 🏫 Plataforma de Simulacros ICFES
## Escuela Normal Superior del Alto Sinú
**Creado por Porfe Carlos Durán – 2026**

---

## 📦 Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear tu archivo de configuración a partir del ejemplo
cp .env.example .env
# Abre .env y define tu propio ADMIN_PASSWORD y SESSION_SECRET

# 3. Iniciar el servidor
node server.js

# 4. Abrir en el navegador
http://localhost:3000
```

---

## 🔑 Acceso al Administrador

El usuario y la contraseña de administrador **no vienen incluidos en el
código** — los defines tú en tu archivo `.env` (que nunca se sube al
repositorio):

```env
ADMIN_USER=admin
ADMIN_PASSWORD=elige-tu-propia-contrasena
SESSION_SECRET=una-cadena-larga-y-aleatoria
```

Si no configuras `ADMIN_PASSWORD`, el acceso de administrador queda
deshabilitado por seguridad hasta que lo hagas.

---

## 📁 Estructura del Proyecto

```
simulacro/
├── server.js              ← Servidor principal
├── public/
│   ├── logo.png           ← Logo de la institución
│   ├── index.html         ← Página de login/registro
│   ├── dashboard.html     ← Dashboard del estudiante
│   ├── presentar.html     ← Pantalla del simulacro
│   ├── admin.html         ← Panel administrativo
│   └── uploads/pdfs/      ← PDFs de simulacros (auto-generado)
├── routes/
│   ├── auth.js            ← Registro e inicio de sesión
│   ├── student.js         ← Rutas del estudiante
│   ├── admin.js           ← Rutas del administrador
│   └── simulacro.js       ← Rutas del simulacro
└── data/
    ├── users.json         ← Base de datos de estudiantes
    ├── simulacros.json    ← Base de datos de simulacros
    └── resultados.json    ← Historial de resultados
```

---

## 🚀 Flujo del Sistema

### Como Administrador:
1. Ingresar con `admin / admin123`
2. Ir a **Simulacros** → Crear nuevo simulacro
3. En el simulacro creado, hacer clic en **⚙️ Gestionar**
4. Subir PDFs para cada área (Lectura Crítica, Matemáticas, etc.)
5. Agregar las preguntas de cada área con sus opciones y respuesta correcta
6. Activar el simulacro (toggle ✅ Activo)
7. Ver resultados en **Resultados** → filtrar por grado

### Como Estudiante:
1. Registrarse con nombres, apellidos, documento, grado y contraseña
2. Ingresar con documento y contraseña
3. Ver simulacros disponibles → clic en **🚀 Presentar Simulacro**
4. Ver el PDF de cada área y responder las preguntas
5. Al terminar, clic en **📤 Entregar** o esperar que el tiempo se acabe
6. Ver resultado con puntaje tipo ICFES
7. Consultar historial de resultados en el dashboard

---

## ⚙️ Características

- ✅ Registro y autenticación de estudiantes
- ✅ Visor de PDF integrado para cada área
- ✅ Temporizador regresivo configurable
- ✅ Puntaje tipo ICFES (0-100) por área y global
- ✅ Historial de progreso por estudiante
- ✅ Panel de administrador completo
- ✅ Gestión de simulacros, PDFs y preguntas
- ✅ Filtros por grado (11-01, 11-02, 11-03)
- ✅ Datos persistidos en archivos JSON

---

## 🔒 Datos de estudiantes

Los archivos en `data/` (`users.json`, `resultados.json`, `simulacros.json`)
se incluyen vacíos (`[]`). El servidor los va llenando a medida que los
estudiantes se registran y presentan simulacros — **esos datos contienen
información personal real (nombres, documentos de identidad) y no deben
subirse nunca a un repositorio de GitHub**, ni público ni privado. Ya están
listados en `.gitignore` para evitarlo por accidente.

---

## 📊 Escala de Calificación ICFES

| Puntaje | Nivel |
|---------|-------|
| 80-100 | Excelente |
| 65-79  | Bueno |
| 50-64  | Básico |
| 0-49   | Bajo |

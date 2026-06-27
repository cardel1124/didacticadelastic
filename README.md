# Didáctica de las TIC · Educación para la Paz y CTS

Sitio web del curso **Didáctica de las TIC**, con enfoque en **Educación para
la Paz** y **Ciencia, Tecnología y Sociedad (CTS)**. Incluye un foro de
discusión, juegos educativos interactivos, presentaciones y herramientas de
apoyo a la docencia.

## 🌐 Ver el sitio publicado

Una vez publicado con GitHub Pages (ver instrucciones abajo), el sitio
quedará disponible en:

```
https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/
```

## 📁 Estructura del repositorio

```
.
├── index.html              ← Página de inicio del curso
├── foro.html                ← Foro de discusión (Firebase/Firestore)
├── recursos/
│   ├── juegos/               ← Juegos educativos en HTML (abren en el navegador)
│   └── presentaciones/       ← Presentaciones .pptx / .ppsx / .pptm
└── herramientas/
    ├── kahoot-ensas/          ← Servidor de cuestionarios en tiempo real (Node.js)
    └── simulacro-icfes/       ← Plataforma de simulacros tipo ICFES (Node.js)
```

Los **juegos** y **presentaciones** funcionan directamente en GitHub Pages
porque son archivos estáticos. Las **herramientas** (`kahoot-ensas` y
`simulacro-icfes`) necesitan un servidor Node.js corriendo, así que no abren
como un link directo desde GitHub Pages — cada una tiene su propio `README.md`
con instrucciones para correrla en tu computador.

## 🚀 Publicar el sitio con GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado; para
   GitHub Pages gratuito en cuentas personales, debe ser público).
2. Sube este contenido al repositorio:
   ```bash
   git init
   git add .
   git commit -m "Sitio del curso: foro, juegos y recursos"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPOSITORIO.git
   git push -u origin main
   ```
3. En GitHub, ve a **Settings → Pages**.
4. En **Source**, selecciona la rama `main` y la carpeta `/ (root)`.
5. Guarda. GitHub te dará la URL pública en uno o dos minutos.

## 💬 Sobre el foro

El foro (`foro.html`) usa [Firebase Firestore](https://firebase.google.com/)
para guardar las participaciones y comentarios de los estudiantes. La clave
`apiKey` que aparece en el código **no es secreta** — las claves de Firebase
para apps web están pensadas para ser públicas. Lo que realmente protege los
datos son las **reglas de seguridad de Firestore**, que se configuran desde
la consola de Firebase (Firestore Database → Reglas), no en este archivo. Si
vas a usar el foro con estudiantes reales, vale la pena revisar esas reglas
antes de la primera clase.

## 🛠️ Sobre las herramientas con servidor

`kahoot-ensas` y `simulacro-icfes` son aplicaciones Node.js completas, no
páginas estáticas. Cada una incluye su propio `README.md` con instrucciones
de instalación. En resumen:

```bash
cd herramientas/simulacro-icfes   # o herramientas/kahoot-ensas
npm install
cp .env.example .env    # solo simulacro-icfes; define tu contraseña de administrador
npm start               # o: node server.js
```

**Importante:** ningún dato real de estudiantes (nombres, documentos de
identidad, resultados) debe subirse jamás a este repositorio. Los archivos
de datos se incluyen vacíos y ya están protegidos en `.gitignore`.

## 📚 Contenido no incluido

Este repositorio no incluye un conjunto adicional de materiales de lectoescritura
y cuentos infantiles de terceros (con personajes con derechos de autor) que no
corresponden al contenido propio del curso. Si necesitas esos materiales para
otro uso, gestiónalos por separado fuera de este repositorio.

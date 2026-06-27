# Kahoot ENSAS

Servidor propio de cuestionarios en tiempo real, estilo Kahoot, con preguntas
de la ENSAS (Escuela Normal Superior del Alto Sinú). Usa WebSockets para
sincronizar las preguntas entre quien presenta (host) y los jugadores.

## Por qué no funciona como un enlace directo

Esta herramienta necesita un servidor [Node.js](https://nodejs.org/) corriendo
de forma continua para sincronizar a los jugadores en tiempo real. GitHub
Pages solo sirve archivos estáticos (HTML, CSS, JS, imágenes), así que **no
puede ejecutar este servidor**. Por eso tienes que correrlo en tu propio
computador.

## Cómo usarlo

1. Instala [Node.js](https://nodejs.org/) (versión 18 o superior) si no lo
   tienes.
2. Abre una terminal en esta carpeta (`herramientas/kahoot-ensas`).
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Inicia el servidor:
   ```bash
   npm start
   ```
   o, en Windows, haz doble clic en `INICIAR KAHOOT.bat`.
5. Abre en tu navegador:
   - **Quien presenta (host):** `http://localhost:3000/host.html`
   - **Jugadores:** `http://localhost:3000/player.html` (cada estudiante,
     desde su propio dispositivo conectado a la misma red).

## Preguntas del cuestionario

Las preguntas están en `quiz_ensas.json` y en la carpeta `Kahoots_ENSAS/`.
Puedes editarlas o crear nuevos cuestionarios siguiendo el mismo formato:

```json
{
  "question": "Texto de la pregunta",
  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
  "correct": 2,
  "time": 20,
  "qtype": "quiz"
}
```

`correct` es el índice (empezando en 0) de la opción correcta.

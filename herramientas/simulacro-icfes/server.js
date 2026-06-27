require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const simulacroRoutes = require('./routes/simulacro');
const pdfExtractRoutes = require('./routes/pdfextract');
const estadisticasRoutes = require('./routes/estadisticas'); 

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET no está configurada en el archivo .env. Se usará un valor temporal inseguro — NO usar así en producción.');
}

// Ensure data files exist
const DATA_DIR = path.join(__dirname, 'data');
fse.ensureDirSync(DATA_DIR);

if (!fs.existsSync(path.join(DATA_DIR, 'users.json'))) {
  fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify([], null, 2));
}
if (!fs.existsSync(path.join(DATA_DIR, 'simulacros.json'))) {
  fs.writeFileSync(path.join(DATA_DIR, 'simulacros.json'), JSON.stringify([], null, 2));
}
if (!fs.existsSync(path.join(DATA_DIR, 'resultados.json'))) {
  fs.writeFileSync(path.join(DATA_DIR, 'resultados.json'), JSON.stringify([], null, 2));
}

// Middlewares — límite aumentado a 50MB para simulacros con muchas preguntas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET || 'temporal-inseguro-configura-tu-.env',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));


// ═════════════════════════════════════════════════════════════════════════
// NUEVA RUTA: DETALLE PxP PARA EL ADMINISTRADOR
// ═════════════════════════════════════════════════════════════════════════
app.get('/admin/resultado-detalle/:simId/:doc', (req, res) => {
  try {
    const { simId, doc } = req.params;
    
    // Leer base de datos (archivos JSON)
    const resultados = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'resultados.json'), 'utf-8'));
    const simulacros = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'simulacros.json'), 'utf-8'));

    // Buscar el resultado específico del estudiante
    const resultado = resultados.find(r => r.simulacroId === simId && r.documento === doc);
    if (!resultado) {
      return res.status(404).json({ success: false, message: 'Resultado no encontrado para este estudiante.' });
    }

    // Buscar el simulacro original para obtener el texto de las preguntas y la clave correcta
    const simulacro = simulacros.find(s => s.id === simId);
    if (!simulacro) {
      return res.status(404).json({ success: false, message: 'El simulacro original ya no existe.' });
    }

    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // Construir el detalle área por área y pregunta por pregunta
    const areasDetalle = (simulacro.areas || []).map((area, aIdx) => {
      return {
        nombre: area.nombre,
        preguntas: (area.preguntas || []).map((preg, pIdx) => {
          // Buscar qué respondió el estudiante en el diccionario de respuestas ("0-0": 2, "0-1": 0...)
          const respUser = resultado.respuestas ? resultado.respuestas[`${aIdx}-${pIdx}`] : null;
          const sinResponder = respUser === undefined || respUser === null;
          const esCorrecta = respUser === preg.respuestaCorrecta;

          return {
            numero: pIdx + 1,
            texto: preg.texto || preg.enunciado || '',
            opciones: preg.opciones || [],
            sinResponder,
            esCorrecta,
            respuestaMarcada: respUser,
            letraMarcada: sinResponder ? null : letras[respUser],
            respuestaCorrecta: preg.respuestaCorrecta,
            letraCorrecta: letras[preg.respuestaCorrecta] || '?'
          };
        })
      };
    });

    // Enviar la respuesta armada al frontend
    res.json({
      success: true,
      puntajeGlobal: resultado.puntajeGlobal,
      simulacroNombre: resultado.simulacroNombre,
      nivel: resultado.nivel,
      fecha: resultado.fecha,
      areas: areasDetalle
    });

  } catch (error) {
    console.error('Error al generar detalle PxP Admin:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor al procesar el PxP.' });
  }
});
// ═════════════════════════════════════════════════════════════════════════


// Routes
app.use('/auth', authRoutes);
app.use('/estudiante', studentRoutes);
app.use('/admin', adminRoutes);
app.use('/simulacro', simulacroRoutes);
app.use('/pdf', pdfExtractRoutes);
app.use('/admin/estadisticas', estadisticasRoutes);

// Home
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/estudiante/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏫 Escuela Normal Superior del Alto Sinú`);
  console.log(`📚 Plataforma de Simulacros ICFES`);
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(process.env.ADMIN_PASSWORD
    ? `👤 Admin configurado: doc=${process.env.ADMIN_USER || 'admin'}\n`
    : `⚠️  Configura ADMIN_PASSWORD en tu archivo .env para habilitar el acceso de administrador\n`);
});
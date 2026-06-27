// routes/estadisticas.js
// ─────────────────────────────────────────────────────────────────
// Rutas de estadísticas agregadas por simulacro.
// Agrega este archivo en server.js:
//   const estadisticasRoutes = require('./routes/estadisticas');
//   app.use('/admin/estadisticas', estadisticasRoutes);
// ─────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return []; }
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'No autorizado' });
}

/**
 * GET /admin/estadisticas/simulacro/:simId
 * Devuelve, para cada área y cada pregunta, cuántos estudiantes
 * marcaron cada opción (A, B, C, D) y cuál es la respuesta correcta.
 * Filtro opcional por grado: ?grado=11-01
 */
router.get('/simulacro/:simId', requireAdmin, (req, res) => {
  const { simId } = req.params;
  const { grado }  = req.query;

  const simulacros = readJSON('simulacros.json');
  const resultados  = readJSON('resultados.json');

  const simulacro = simulacros.find(s => s.id === simId);
  if (!simulacro) return res.json({ success: false, message: 'Simulacro no encontrado' });

  // Filtrar resultados del simulacro (y grado si se indica)
  let resSim = resultados.filter(r => r.simulacroId === simId);
  if (grado && grado !== 'todos') resSim = resSim.filter(r => r.grado === grado);

  const letras = ['A', 'B', 'C', 'D', 'E', 'F'];

  // Construir estadísticas por área y pregunta
  const areas = (simulacro.areas || []).map((area, aIdx) => {
    const preguntas = (area.preguntas || []).map((preg, pIdx) => {
      const nOpciones = (preg.opciones || []).length || 4;
      const conteos   = Array(nOpciones).fill(0);
      let sinResponder = 0;

      resSim.forEach(r => {
        // Las respuestas se guardan como objeto {"0-0":2,"0-1":1,...} (areaIdx-pregIdx: opcionIdx)
        const val = r.respuestas && r.respuestas[`${aIdx}-${pIdx}`];
        if (val === undefined || val === null) {
          sinResponder++;
        } else {
          const idx = parseInt(val);
          if (idx >= 0 && idx < nOpciones) conteos[idx]++;
        }
      });

      return {
        numero: pIdx + 1,
        texto: preg.texto || preg.enunciado || `Pregunta ${pIdx + 1}`,
        opciones: (preg.opciones || []).map((op, i) => ({
          letra: letras[i] || String(i + 1),
          texto: op,
          conteo: conteos[i],
          porcentaje: resSim.length ? Math.round(conteos[i] / resSim.length * 100) : 0
        })),
        respuestaCorrecta: preg.respuestaCorrecta,
        letraCorrecta: letras[preg.respuestaCorrecta] || '?',
        sinResponder,
        totalEstudiantes: resSim.length
      };
    });

    return { nombre: area.nombre, preguntas };
  });

  res.json({
    success: true,
    simulacro: { id: simulacro.id, nombre: simulacro.nombre },
    totalEstudiantes: resSim.length,
    grado: grado || 'todos',
    areas
  });
});

/**
 * GET /admin/estadisticas/lista-simulacros
 * Lista los simulacros con tipo 'completo' o 'manual' (tienen preguntas con clave)
 */
router.get('/lista-simulacros', requireAdmin, (req, res) => {
  const simulacros = readJSON('simulacros.json');
  const lista = simulacros
    .filter(s => s.tipo !== 'html')
    .map(s => ({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      totalPreguntas: (s.areas || []).reduce((a, ar) => a + (ar.preguntas ? ar.preguntas.length : 0), 0),
      areas: (s.areas || []).map(a => a.nombre)
    }));
  res.json({ success: true, simulacros: lista });
});

/**
 * GET /admin/estadisticas/individual/:simId/:documento
 * Devuelve el resultado pregunta a pregunta de un estudiante en un simulacro.
 */
router.get('/individual/:simId/:documento', requireAdmin, (req, res) => {
  const { simId, documento } = req.params;
  const simulacros = readJSON('simulacros.json');
  const resultados  = readJSON('resultados.json');

  const simulacro = simulacros.find(s => s.id === simId);
  if (!simulacro) return res.json({ success: false, message: 'Simulacro no encontrado' });

  // Tomar el resultado más reciente del estudiante en ese simulacro
  const resultado = resultados
    .filter(r => r.simulacroId === simId && r.documento === documento)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];

  if (!resultado) return res.json({ success: false, message: 'Sin resultado para este estudiante' });

  const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
  const areas = (simulacro.areas || []).map((area, aIdx) => ({
    nombre: area.nombre,
    preguntas: (area.preguntas || []).map((preg, pIdx) => {
      const marcada   = resultado.respuestas ? resultado.respuestas[`${aIdx}-${pIdx}`] : undefined;
      const correcta  = preg.respuestaCorrecta;
      const esCorrecta = marcada !== undefined && marcada !== null && parseInt(marcada) === correcta;
      return {
        numero: pIdx + 1,
        texto: preg.texto || preg.enunciado || `Pregunta ${pIdx + 1}`,
        opciones: preg.opciones || [],
        respuestaCorrecta: correcta,
        letraCorrecta: letras[correcta] || '?',
        respuestaMarcada: marcada !== undefined && marcada !== null ? parseInt(marcada) : null,
        letraMarcada: marcada !== undefined && marcada !== null ? (letras[parseInt(marcada)] || '?') : '—',
        esCorrecta,
        sinResponder: marcada === undefined || marcada === null
      };
    })
  }));

  res.json({
    success: true,
    estudiante: resultado.estudianteNombre,
    documento: resultado.documento,
    grado: resultado.grado,
    simulacro: { id: simulacro.id, nombre: simulacro.nombre },
    fecha: resultado.fecha,
    puntajeGlobal: resultado.puntajeGlobal,
    nivel: resultado.nivel,
    areas
  });
});

module.exports = router;

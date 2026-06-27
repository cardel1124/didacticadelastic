const express = require('express');
const router = express.Router();
const fs  = require('fs');
const fse = require('fs-extra');
const path = require('path');

const SIMULACROS_FILE = path.join(__dirname, '../data/simulacros.json');
const RESULTADOS_FILE = path.join(__dirname, '../data/resultados.json');

// ── Carpeta de progreso (se crea automáticamente si no existe) ────────────────
const PROGRESO_DIR = path.join(__dirname, '..', 'data', 'progreso');
fse.ensureDirSync(PROGRESO_DIR);

// ── Helpers ───────────────────────────────────────────────────────────────────
function authCheck(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'estudiante') return res.redirect('/');
  next();
}
function getSimulacros() { return JSON.parse(fs.readFileSync(SIMULACROS_FILE, 'utf8')); }
function getResultados()  { return JSON.parse(fs.readFileSync(RESULTADOS_FILE, 'utf8')); }
function saveResultados(r){ fs.writeFileSync(RESULTADOS_FILE, JSON.stringify(r, null, 2)); }
function progresoPath(doc, simId) {
  return path.join(PROGRESO_DIR, `${doc}_${simId}.json`);
}

// ── Rutas básicas ─────────────────────────────────────────────────────────────
router.get('/dashboard', authCheck, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

router.get('/me', authCheck, (req, res) => {
  res.json({ success: true, user: req.session.user });
});

router.get('/simulacros-activos', authCheck, (req, res) => {
  const simulacros = getSimulacros().filter(s => s.activo);
  res.json({ success: true, simulacros });
});

router.get('/simulacro/:id', authCheck, (req, res) => {
  const sim = getSimulacros().find(s => s.id === req.params.id && s.activo);
  if (!sim) return res.json({ success: false, message: 'Simulacro no disponible.' });
  res.json({ success: true, simulacro: sim });
});

// PDF de un área
router.get('/simulacro/:id/area/:areaIndex/pdf', authCheck, (req, res) => {
  const sim = getSimulacros().find(s => s.id === req.params.id && s.activo);
  if (!sim) return res.status(404).send('No encontrado');
  const area = sim.areas[parseInt(req.params.areaIndex)];
  if (!area || !area.pdfPath) return res.status(404).send('PDF no encontrado');
  const pdfPath = path.join(__dirname, '../public', area.pdfPath);
  if (!fs.existsSync(pdfPath)) return res.status(404).send('Archivo no existe');
  res.sendFile(pdfPath);
});

// ── Entregar resultado ────────────────────────────────────────────────────────
router.post('/simulacro/:id/resultado', authCheck, (req, res) => {
  try {
    const { respuestas, tiempoUsado } = req.body;
    const sim = getSimulacros().find(s => s.id === req.params.id);
    if (!sim) return res.json({ success: false, message: 'Simulacro no encontrado.' });

    const ICFES_PESOS = {
      'Lectura Crítica': 25, 'Matemáticas': 25,
      'Ciencias Naturales': 17, 'Ciencias Sociales': 17,
      'Ciencias Sociales y Ciudadanas': 17, 'Inglés': 16
    };

    const resultadoAreas = [];
    let totalCorrectas = 0, totalPreguntas = 0, puntajeGlobal = 0, pesoTotal = 0;

    sim.areas.forEach((area, aIdx) => {
      let correctas = 0;
      const preguntasArea = area.preguntas ? area.preguntas.length : 0;
      (area.preguntas || []).forEach((preg, pIdx) => {
        const key = `${aIdx}-${pIdx}`;
        if (respuestas[key] !== undefined && Number(respuestas[key]) === preg.respuestaCorrecta) correctas++;
      });
      totalCorrectas  += correctas;
      totalPreguntas  += preguntasArea;
      const puntajeArea = preguntasArea > 0 ? Math.round((correctas / preguntasArea) * 100) : 0;
      const nivelArea   = puntajeArea >= 80 ? 'Avanzado' : puntajeArea >= 65 ? 'Satisfactorio' : puntajeArea >= 35 ? 'Mínimo' : 'Insuficiente';
      const pesoArea    = ICFES_PESOS[area.nombre] || Math.round(100 / sim.areas.length);
      pesoTotal      += pesoArea;
      puntajeGlobal  += puntajeArea * pesoArea;
      resultadoAreas.push({ area: area.nombre, correctas, total: preguntasArea, puntaje: puntajeArea, nivel: nivelArea, peso: pesoArea });
    });

    puntajeGlobal = pesoTotal > 0
      ? Math.round(puntajeGlobal / pesoTotal)
      : (totalPreguntas > 0 ? Math.round((totalCorrectas / totalPreguntas) * 100) : 0);
    const nivel = puntajeGlobal >= 80 ? 'Excelente' : puntajeGlobal >= 65 ? 'Bueno' : puntajeGlobal >= 50 ? 'Básico' : 'Bajo';

    const resultado = {
      id: Date.now().toString(),
      estudianteId:     req.session.user.id,
      estudianteNombre: `${req.session.user.nombres} ${req.session.user.apellidos || ''}`.trim(),
      documento:        req.session.user.documento,
      grado:            req.session.user.grado,
      simulacroId:      sim.id,
      simulacroNombre:  sim.nombre,
      fecha:            new Date().toISOString(),
      tiempoUsado,
      resultadoAreas,
      totalCorrectas,
      totalPreguntas,
      puntajeGlobal,
      nivel,
      respuestas
    };

    const resultados = getResultados();
    resultados.push(resultado);
    saveResultados(resultados);

    // Borrar progreso guardado al entregar exitosamente
    const fp = progresoPath(req.session.user.documento, sim.id);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch(e) {}

    res.json({ success: true, resultado });
  } catch (err) {
    console.error('Error resultado:', err);
    res.json({ success: false, message: 'Error al guardar resultado.' });
  }
});

// ── Historial ─────────────────────────────────────────────────────────────────
router.get('/historial', authCheck, (req, res) => {
  const resultados = getResultados().filter(r => r.estudianteId === req.session.user.id);
  res.json({ success: true, historial: resultados });
});

// ── HTML simulacro resultado ──────────────────────────────────────────────────
router.post('/simulacro-html/resultado', authCheck, (req, res) => {
  try {
    const { htmlSimulacroNombre, correctas, total, puntaje, nivel, tiempoUsado } = req.body;
    const resultado = {
      id: Date.now().toString(),
      estudianteId:     req.session.user.id,
      estudianteNombre: `${req.session.user.nombres} ${req.session.user.apellidos || ''}`.trim(),
      documento:        req.session.user.documento,
      grado:            req.session.user.grado,
      simulacroId:      'html-' + Date.now(),
      simulacroNombre:  htmlSimulacroNombre || 'Simulacro HTML',
      fecha:            new Date().toISOString(),
      tiempoUsado:      tiempoUsado || 'N/D',
      tipo:             'html',
      resultadoAreas:   [{ area: 'Resultado General', correctas: correctas||0, total: total||0, puntaje: puntaje||0 }],
      totalCorrectas:   correctas || 0,
      totalPreguntas:   total || 0,
      puntajeGlobal:    puntaje || 0,
      nivel:            nivel || 'Bajo'
    };
    const resultados = getResultados();
    const recent = resultados.find(r =>
      r.estudianteId === resultado.estudianteId &&
      r.simulacroNombre === resultado.simulacroNombre &&
      (Date.now() - new Date(r.fecha).getTime()) < 5000
    );
    if (recent) return res.json({ success: true, duplicate: true });
    resultados.push(resultado);
    saveResultados(resultados);
    res.json({ success: true, resultado });
  } catch (err) {
    res.json({ success: false });
  }
});

// ── Detalle P×P ───────────────────────────────────────────────────────────────
router.get('/resultado-detalle/:simId', authCheck, (req, res) => {
  const { simId } = req.params;
  const doc = req.session.user.documento;
  const simulacro = getSimulacros().find(s => s.id === simId);
  if (!simulacro) return res.json({ success: false, message: 'Simulacro no encontrado' });

  const resultado = getResultados()
    .filter(r => r.simulacroId === simId && r.documento === doc)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  if (!resultado) return res.json({ success: false, message: 'Sin resultado para este simulacro' });

  const letras = ['A','B','C','D','E','F'];
  const areas = (simulacro.areas || []).map((area, aIdx) => ({
    nombre: area.nombre,
    preguntas: (area.preguntas || []).map((preg, pIdx) => {
      const marcada    = resultado.respuestas ? resultado.respuestas[`${aIdx}-${pIdx}`] : undefined;
      const correcta   = preg.respuestaCorrecta;
      const marcadaInt = (marcada !== undefined && marcada !== null) ? parseInt(marcada) : null;
      const esCorrecta = marcadaInt !== null && marcadaInt === correcta;
      return {
        numero: pIdx + 1,
        texto: preg.texto || preg.enunciado || `Pregunta ${pIdx + 1}`,
        opciones: preg.opciones || [],
        respuestaCorrecta: correcta,
        letraCorrecta:  letras[correcta]  || '?',
        respuestaMarcada: marcadaInt,
        letraMarcada: marcadaInt !== null ? (letras[marcadaInt] || '?') : '—',
        esCorrecta,
        sinResponder: marcadaInt === null
      };
    })
  }));

  res.json({
    success: true,
    simulacroNombre:  simulacro.nombre,
    fecha:            resultado.fecha,
    puntajeGlobal:    resultado.puntajeGlobal,
    nivel:            resultado.nivel,
    totalCorrectas:   resultado.totalCorrectas,
    totalPreguntas:   resultado.totalPreguntas,
    areas
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SISTEMA DE PROGRESO — Recuperar simulacro interrumpido
// ════════════════════════════════════════════════════════════════════════════

// POST — Guardar progreso (se llama tras cada respuesta y cada 30 s)
router.post('/simulacro/:id/progreso', authCheck, (req, res) => {
  const simId = req.params.id;
  const doc   = req.session.user.documento;
  const { respuestas, tiempoRestante } = req.body;
  if (!respuestas || tiempoRestante === undefined) return res.json({ success: false });

  const progreso = {
    documento:      doc,
    simulacroId:    simId,
    respuestas,
    tiempoRestante: Number(tiempoRestante),
    guardadoEn:     Date.now()   // timestamp para descontar tiempo offline
  };
  try {
    fs.writeFileSync(progresoPath(doc, simId), JSON.stringify(progreso, null, 2));
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false });
  }
});

// GET — Recuperar progreso (descuenta tiempo transcurrido offline)
router.get('/simulacro/:id/progreso', authCheck, (req, res) => {
  const simId = req.params.id;
  const doc   = req.session.user.documento;
  const fpath = progresoPath(doc, simId);

  if (!fs.existsSync(fpath)) return res.json({ success: true, progreso: null });

  try {
    const prog  = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const seg   = Math.floor((Date.now() - (prog.guardadoEn || Date.now())) / 1000);
    prog.tiempoRestante = Math.max(0, prog.tiempoRestante - seg);
    if (prog.tiempoRestante <= 0) {
      try { fs.unlinkSync(fpath); } catch(e) {}
      return res.json({ success: true, progreso: null });
    }
    res.json({ success: true, progreso: prog });
  } catch(e) {
    res.json({ success: true, progreso: null });
  }
});

// DELETE — Borrar progreso (al entregar o descartar)
router.delete('/simulacro/:id/progreso', authCheck, (req, res) => {
  const fpath = progresoPath(req.session.user.documento, req.params.id);
  try { if (fs.existsSync(fpath)) fs.unlinkSync(fpath); } catch(e) {}
  res.json({ success: true });
});

// GET — Listar todos los progresos activos del estudiante (para el dashboard)
router.get('/mis-progresos', authCheck, (req, res) => {
  const doc = req.session.user.documento;
  try {
    const archivos = fs.readdirSync(PROGRESO_DIR)
      .filter(f => f.startsWith(`${doc}_`) && f.endsWith('.json'));

    const progresos = [];
    for (const fname of archivos) {
      try {
        const p   = JSON.parse(fs.readFileSync(path.join(PROGRESO_DIR, fname), 'utf8'));
        const seg = Math.floor((Date.now() - (p.guardadoEn || Date.now())) / 1000);
        p.tiempoRestante = Math.max(0, p.tiempoRestante - seg);
        if (p.tiempoRestante > 0) {
          progresos.push(p);
        } else {
          try { fs.unlinkSync(path.join(PROGRESO_DIR, fname)); } catch(e) {}
        }
      } catch(e) {
        try { fs.unlinkSync(path.join(PROGRESO_DIR, fname)); } catch(e2) {}
      }
    }
    res.json({ success: true, progresos });
  } catch(e) {
    res.json({ success: true, progresos: [] });
  }
});

module.exports = router;

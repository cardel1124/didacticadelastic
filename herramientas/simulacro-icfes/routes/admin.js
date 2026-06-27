const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // Añadido para el restablecimiento de contraseñas

const SIMULACROS_FILE = path.join(__dirname, '../data/simulacros.json');
const RESULTADOS_FILE = path.join(__dirname, '../data/resultados.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');

function adminCheck(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
  next();
}
function getSimulacros() { return JSON.parse(fs.readFileSync(SIMULACROS_FILE, 'utf8')); }
function saveSimulacros(s) { fs.writeFileSync(SIMULACROS_FILE, JSON.stringify(s, null, 2)); }
function getResultados() { return JSON.parse(fs.readFileSync(RESULTADOS_FILE, 'utf8')); }
function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(__dirname, '../public/uploads/pdfs'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const s = file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'); cb(null, `${Date.now()}_${s}`); }
});
const uploadPDF = multer({ storage: pdfStorage, fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Solo PDFs')) });

const htmlStorage = multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(__dirname, '../public/simulacros'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const s = file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'); cb(null, `${Date.now()}_${s}`); }
});
const uploadHTML = multer({ storage: htmlStorage, limits: { fileSize: 15 * 1024 * 1024 } });

const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(__dirname, '../public/uploads/imgs'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const ext = path.extname(file.originalname); cb(null, `img_${Date.now()}${ext}`); }
});
const uploadImg = multer({ storage: imgStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => { if(file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Solo imágenes')); } });

router.get('/dashboard', adminCheck, (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
router.get('/simulacros', adminCheck, (req, res) => res.json({ success: true, simulacros: getSimulacros() }));

router.post('/simulacros', adminCheck, (req, res) => {
  try {
    const { nombre, descripcion, duracion, areas, tipo } = req.body;
    if (!nombre) return res.json({ success: false, message: 'Nombre requerido.' });
    const simulacros = getSimulacros();
    let parsedAreas = [];
    if (areas) {
      try { parsedAreas = typeof areas === 'string' ? JSON.parse(areas) : (Array.isArray(areas) ? areas : []); }
      catch(e) { parsedAreas = []; }
    }
    const totalPregs = parsedAreas.reduce((a,ar) => a + (ar.preguntas ? ar.preguntas.length : 0), 0);
    const nuevo = {
      id: uuidv4(), nombre,
      descripcion: descripcion||'',
      duracion: parseInt(duracion)||120,
      activo: false,
      tipo: tipo || (parsedAreas.length > 0 ? 'completo' : 'manual'),
      areas: parsedAreas,
      creadoEn: new Date().toISOString()
    };
    simulacros.push(nuevo);
    saveSimulacros(simulacros);
    console.log('Simulacro creado:', nombre, '|', parsedAreas.length, 'areas |', totalPregs, 'preguntas');
    res.json({ success: true, simulacro: nuevo });
  } catch(err) {
    console.error('Error:', err);
    res.json({ success: false, message: 'Error: ' + err.message });
  }
});

router.post('/simulacros/upload-html', adminCheck, uploadHTML.single('htmlFile'), (req, res) => {
  try {
    const { nombre, descripcion, duracion } = req.body;
    if (!req.file) return res.json({ success: false, message: 'Archivo HTML requerido.' });
    if (!nombre) return res.json({ success: false, message: 'Nombre requerido.' });

    const htmlPath = path.join(__dirname, '../public/simulacros', req.file.filename);
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    let totalPreguntas = 0;
    const totalMatch = htmlContent.match(/const\s+TOTAL\s*=\s*(\d+)/);
    if (totalMatch) totalPreguntas = parseInt(totalMatch[1]);

    let duracionAuto = parseInt(duracion) || 120;
    const secsMatch = htmlContent.match(/TOTAL_SECONDS\s*=\s*(\d+)/);
    if (secsMatch) duracionAuto = Math.round(parseInt(secsMatch[1]) / 60);

    let answerKey = null;
    const akMatch = htmlContent.match(/const\s+ANSWER_KEY\s*=\s*\{([^}]+)\}/s);
    if (akMatch) {
      answerKey = {};
      const pairs = akMatch[1].match(/(\d+)\s*:\s*'([A-Z])'/g);
      if (pairs) pairs.forEach(p => { const m = p.match(/(\d+)\s*:\s*'([A-Z])'/); if(m) answerKey[m[1]] = m[2]; });
    }

    const simNombreJs = JSON.stringify(nombre);
    const injectScript = `\n<script>\n(function(){\n  window.__ENS_SIM_NOMBRE__ = ${simNombreJs};\n  function captureResult(){\n    var rc=document.getElementById('res-correct');\n    var rw=document.getElementById('res-wrong');\n    if(!rc) return;\n    var correctas=parseInt(rc.textContent)||0;\n    var incorrectas=rw?parseInt(rw.textContent)||0:0;\n    var total=correctas+incorrectas;\n    var puntaje=total>0?Math.round((correctas/total)*100):0;\n    var nivel=puntaje>=80?'Excelente':puntaje>=65?'Bueno':puntaje>=50?'Básico':'Bajo';\n    var timerEl=document.getElementById('timer-display');\n    fetch('/estudiante/simulacro-html/resultado',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({htmlSimulacroNombre:window.__ENS_SIM_NOMBRE__,correctas:correctas,incorrectas:incorrectas,total:total,puntaje:puntaje,nivel:nivel,tiempoUsado:timerEl?timerEl.textContent:'N/D'})}).catch(function(){});\n  }\n  window.addEventListener('load',function(){\n    var origSubmit=window.submitQuiz;\n    if(typeof origSubmit==='function'){window.submitQuiz=function(a){origSubmit(a);setTimeout(captureResult,900);};}\n    var rp=document.getElementById('results-panel');\n    if(rp){var obs=new MutationObserver(function(){if(rp.style.display!=='none'){captureResult();obs.disconnect();}});obs.observe(rp,{attributes:true,attributeFilter:['style']});}\n  });\n})();\n</script>`;

    htmlContent = htmlContent.includes('</body>') ? htmlContent.replace('</body>', injectScript + '\n</body>') : htmlContent + injectScript;
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    const simulacros = getSimulacros();
    const nuevo = { id: uuidv4(), nombre, descripcion: descripcion||'', duracion: duracionAuto, activo: false, tipo: 'html', htmlFile: req.file.filename, htmlPath: `/simulacros/${req.file.filename}`, totalPreguntas, answerKey, areas: [], creadoEn: new Date().toISOString() };
    simulacros.push(nuevo);
    saveSimulacros(simulacros);
    res.json({ success: true, simulacro: nuevo });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Error: ' + err.message });
  }
});

router.put('/simulacros/:id/toggle', adminCheck, (req, res) => {
  const simulacros = getSimulacros();
  const sim = simulacros.find(s => s.id === req.params.id);
  if (!sim) return res.json({ success: false });
  sim.activo = !sim.activo;
  saveSimulacros(simulacros);
  res.json({ success: true, activo: sim.activo });
});

router.delete('/simulacros/:id', adminCheck, (req, res) => {
  const simulacros = getSimulacros();
  const sim = simulacros.find(s => s.id === req.params.id);
  if (sim && sim.htmlFile) { const fp = path.join(__dirname, '../public/simulacros', sim.htmlFile); if(fs.existsSync(fp)) fs.unlinkSync(fp); }
  saveSimulacros(simulacros.filter(s => s.id !== req.params.id));
  res.json({ success: true });
});

router.post('/simulacros/:id/area-pdf', adminCheck, uploadPDF.single('pdf'), (req, res) => {
  try {
    const { areaNombre } = req.body;
    const simulacros = getSimulacros();
    const sim = simulacros.find(s => s.id === req.params.id);
    if (!sim) return res.json({ success: false, message: 'Simulacro no encontrado.' });
    if (!req.file) return res.json({ success: false, message: 'PDF requerido.' });
    const area = { nombre: areaNombre||'Área', pdfPath: `/uploads/pdfs/${req.file.filename}`, preguntas: [] };
    if (!sim.areas) sim.areas = [];
    const idx = sim.areas.findIndex(a => a.nombre === area.nombre);
    if (idx >= 0) sim.areas[idx] = area; else sim.areas.push(area);
    saveSimulacros(simulacros);
    res.json({ success: true, area });
  } catch (err) { res.json({ success: false, message: 'Error al cargar PDF.' }); }
});

router.put('/simulacros/:id/areas/:areaIndex/preguntas', adminCheck, (req, res) => {
  const { preguntas } = req.body;
  const simulacros = getSimulacros();
  const sim = simulacros.find(s => s.id === req.params.id);
  if (!sim) return res.json({ success: false });
  const area = sim.areas[parseInt(req.params.areaIndex)];
  if (!area) return res.json({ success: false });
  area.preguntas = preguntas;
  saveSimulacros(simulacros);
  res.json({ success: true });
});

router.get('/resultados', adminCheck, (req, res) => res.json({ success: true, resultados: getResultados() }));
router.get('/usuarios', adminCheck, (req, res) => res.json({ success: true, usuarios: getUsers().map(u => ({...u, password: undefined})) }));
router.get('/resultados/usuario/:docId', adminCheck, (req, res) => res.json({ success: true, resultados: getResultados().filter(r => r.documento === req.params.docId) }));

// ── Upload image for question ──
router.post('/upload-imagen', adminCheck, uploadImg.single('imagen'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No se recibió imagen.' });
  res.json({ success: true, url: '/uploads/imgs/' + req.file.filename });
});

// ════════════════════════════════════════════════════════════════════════════
// RUTAS AÑADIDAS: Gestión de Usuarios
// ════════════════════════════════════════════════════════════════════════════

// ── DELETE /admin/usuarios/:doc ───────────────────────────────────────────────
// Elimina un estudiante por documento.
// NO elimina sus resultados (quedan como historial del sistema).
// Si quieres eliminar también resultados, cambia keepResultados a false.
router.delete('/usuarios/:doc', adminCheck, (req, res) => {
  const doc = req.params.doc;

  // Leer usuarios
  const usersPath = path.join(__dirname, '..', 'data', 'users.json');
  let users = [];
  try { users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) { return res.json({ success: false, message: 'Error leyendo usuarios' }); }

  const idx = users.findIndex(u => u.documento === doc);
  if (idx === -1) return res.json({ success: false, message: 'Estudiante no encontrado' });

  const nombre = `${users[idx].nombres} ${users[idx].apellidos || ''}`.trim();

  // Eliminar el usuario del array
  users.splice(idx, 1);
  try { fs.writeFileSync(usersPath, JSON.stringify(users, null, 2)); } catch(e) { return res.json({ success: false, message: 'Error guardando usuarios' }); }

  // Borrar también sus archivos de progreso en curso (si existen)
  try {
    const progresoDir = path.join(__dirname, '..', 'data', 'progreso');
    if (fs.existsSync(progresoDir)) {
      fs.readdirSync(progresoDir)
        .filter(f => f.startsWith(`${doc}_`))
        .forEach(f => { try { fs.unlinkSync(path.join(progresoDir, f)); } catch(e) {} });
    }
  } catch(e) {}

  console.log(`[ADMIN] Estudiante eliminado: ${nombre} (${doc})`);
  res.json({ success: true, message: `Estudiante "${nombre}" eliminado correctamente` });
});

// ── PUT /admin/usuarios/:doc/reset-contrasena ─────────────────────────────────
// Restablece la contraseña de un estudiante.
router.put('/usuarios/:doc/reset-contrasena', adminCheck, async (req, res) => {
  const doc = req.params.doc;
  const { nuevaContrasena } = req.body;

  if (!nuevaContrasena || nuevaContrasena.trim().length < 4) {
    return res.json({ success: false, message: 'La contraseña debe tener al menos 4 caracteres' });
  }

  const usersPath = path.join(__dirname, '..', 'data', 'users.json');
  let users = [];
  try { users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) { return res.json({ success: false, message: 'Error leyendo usuarios' }); }

  const idx = users.findIndex(u => u.documento === doc);
  if (idx === -1) return res.json({ success: false, message: 'Estudiante no encontrado' });

  try {
    // Hashear la nueva contraseña con bcrypt (igual que en el registro)
    const hash = await bcrypt.hash(nuevaContrasena.trim(), 10);
    users[idx].password = hash;
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    console.log(`[ADMIN] Contraseña restablecida: ${users[idx].nombres} (${doc})`);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch(e) {
    console.error('Error reset contraseña:', e);
    res.json({ success: false, message: 'Error al actualizar contraseña' });
  }
});

module.exports = router;
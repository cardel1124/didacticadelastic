const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PDFParser = require('pdf2json');
const mammoth = require('mammoth');

function adminCheck(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  next();
}

const extractStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const d = path.join(__dirname, '../public/uploads/docs');
    fs.mkdirSync(d, { recursive: true });
    cb(null, d);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `doc_${Date.now()}_${safe}`);
  }
});

const uploadDoc = multer({
  storage: extractStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF, DOC o DOCX'));
  }
});

// ── Patterns ──────────────────────────────────────────────────────────────────
const RE_RESPONDE  = /^RESPONDE\s+LA[S]?\s+PREGUNTA[S]?\s+(\d+)\s*(?:[AY]|A|Y)\s*(\d+)?\s*DE\s+ACUERDO/i;
const RE_RESPONDE2 = /^RESPONDE\s+LA\s+PREGUNTA\s+(\d+)\s+DE/i;
const RE_PREGUNTA  = /^Pregunta\s+(\d+)\s*$/i;
const RE_OPCION    = /^([A-D])\.\s+(.+)/;
const RE_OPCION2   = /^\(([A-D])\)\s+(.+)/;  // (A) format
const RE_OPCION3   = /^([A-D])\)\s+(.+)/;    // A) format
const RE_KEY_LINE  = /^(\d{1,3})\s*([A-D])\s*$/;
const RE_KEY_START = /tabla\s+de\s+respuestas|respuestas\s+correctas/i;
const RE_KEY_CONT  = /^(Posici[oó]n|Respuesta|correcta|Afirmaci[oó]n)/i;
const RE_HEADER    = /^(Cuadernillo|Prueba\s+Lectura|Prueba\s+Matem|Saber\s+\d|Ciencias|Sociales|Ingl[eé]s|Competencias)/i;
const RE_TOMADO    = /^(Tomado|Fuente:|Quino|Organización|©|Tomado\s+y\s+adaptado)/i;
const RE_PAGE_NUM  = /^\d{1,3}$/;
const RE_CON_SIG   = /^CON\s+LA\s+SIGUIENTE\s+INFORM|^CON\s+EL\s+SIGUIENTE/i;
const OP_MAP = { A:0, B:1, C:2, D:3 };

function isNoise(line) {
  if (!line || !line.trim()) return true;
  const t = line.trim();
  if (RE_PAGE_NUM.test(t)) return true;
  if (RE_HEADER.test(t)) return true;
  return false;
}

function parseICFES(allLines) {
  // allLines: array of {text, pageIdx}
  const enunciados = {};   // start_q -> text
  const questions  = [];   // {num, texto, opciones, respuestaCorrecta, enunciado, _page}
  const answerKey  = {};   // num -> letter

  let currentQ = null;
  let qTextBuf  = [];
  let qOps      = ['','','',''];
  let qPage     = null;
  let collectOp = null;
  let enuBuf    = [];
  let enuStart  = null;
  let inKey     = false;

  function flushQ() {
    if (currentQ === null) return;
    questions.push({
      num: currentQ,
      texto: qTextBuf.filter(Boolean).join(' ').trim(),
      opciones: qOps.slice(),
      respuestaCorrecta: null,
      enunciado: '',
      imagen: null,
      imagenesOpciones: ['','','',''],
      _page: qPage
    });
    currentQ = null; qTextBuf = []; qOps = ['','','','']; qPage = null; collectOp = null;
  }

  function matchOption(line) {
    let m = RE_OPCION.exec(line) || RE_OPCION2.exec(line) || RE_OPCION3.exec(line);
    if (!m) return null;
    return { letter: m[1].toUpperCase(), text: m[2].trim() };
  }

  let i = 0;
  while (i < allLines.length) {
    const { text: rawLine, pageIdx } = allLines[i];
    const line = rawLine.trim();

    // Answer key detection
    if (RE_KEY_START.test(line)) {
      flushQ();
      inKey = true;
      i++; continue;
    }
    if (inKey) {
      if (RE_KEY_CONT.test(line)) { i++; continue; }
      const km = RE_KEY_LINE.exec(line);
      if (km) { answerKey[parseInt(km[1])] = km[2]; i++; continue; }
      // If we get a non-key line after many keys, check if we're done
      if (Object.keys(answerKey).length > 5 && RE_PREGUNTA.test(line)) {
        inKey = false; // fall through
      } else {
        i++; continue;
      }
    }

    // Skip noise
    if (isNoise(line) || RE_TOMADO.test(line) || RE_CON_SIG.test(line)) { i++; continue; }

    // RESPONDE block
    const mResp = RE_RESPONDE.exec(line) || RE_RESPONDE2.exec(line);
    if (mResp) {
      flushQ();
      enuStart = parseInt(mResp[1]);
      enuBuf = [];
      i++;
      // Collect enunciado until Pregunta N
      while (i < allLines.length) {
        const nl = allLines[i].text.trim();
        if (isNoise(nl) || RE_TOMADO.test(nl) || RE_CON_SIG.test(nl)) { i++; continue; }
        if (RE_PREGUNTA.test(nl) || RE_RESPONDE.test(nl) || RE_RESPONDE2.test(nl)) break;
        enuBuf.push(nl);
        i++;
      }
      enunciados[enuStart] = enuBuf.filter(Boolean).join(' ').trim();
      continue;
    }

    // Pregunta N
    const mPreg = RE_PREGUNTA.exec(line);
    if (mPreg) {
      flushQ();
      currentQ = parseInt(mPreg[1]);
      qTextBuf = []; qOps = ['','','','']; qPage = pageIdx; collectOp = null;
      i++; continue;
    }

    if (currentQ !== null) {
      const op = matchOption(line);
      if (op) {
        const idx = OP_MAP[op.letter];
        if (idx !== undefined) {
          collectOp = idx;
          // If previous option text is empty, try inline
          qOps[idx] = op.text;
          i++;
          // Collect continuation
          while (i < allLines.length) {
            const nl = allLines[i].text.trim();
            if (!nl || isNoise(nl) || matchOption(nl) || RE_PREGUNTA.test(nl) || RE_RESPONDE.test(nl) || RE_KEY_START.test(nl)) break;
            qOps[idx] += ' ' + nl;
            i++;
          }
          qOps[idx] = qOps[idx].trim();
          continue;
        }
      }
      if (collectOp === null) {
        qTextBuf.push(line);
      }
    }

    i++;
  }
  flushQ();

  // Build enunciado range map
  const sortedStarts = Object.keys(enunciados).map(Number).sort((a,b)=>a-b);
  function getEnunciado(qnum) {
    let best = '';
    for (let si = 0; si < sortedStarts.length; si++) {
      const start = sortedStarts[si];
      const end   = si+1 < sortedStarts.length ? sortedStarts[si+1] - 1 : 9999;
      if (start <= qnum && qnum <= end) return enunciados[start];
    }
    return best;
  }

  // Assign enunciados + answer keys
  for (const q of questions) {
    q.enunciado = getEnunciado(q.num);
    if (answerKey[q.num]) {
      q.respuestaCorrecta = OP_MAP[answerKey[q.num]] ?? null;
    }
    delete q._page;
  }

  return { questions, answerKey, enunciados };
}

// ── Extract from PDF ──────────────────────────────────────────────────────────
function extractFromPDF(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    const allLines = [];

    parser.on('pdfParser_dataReady', data => {
      try {
        const pages = data.Pages || [];
        for (let pgIdx = 0; pgIdx < pages.length; pgIdx++) {
          const pg = pages[pgIdx];
          if (!pg.Texts) continue;

          // Group text items by Y position (line grouping)
          const byY = {};
          for (const t of pg.Texts) {
            const y = Math.round(t.y * 10);
            if (!byY[y]) byY[y] = { y: t.y, items: [] };
            const str = t.R ? t.R.map(r => { try { return decodeURIComponent(r.T); } catch(e) { return r.T || ''; } }).join('') : '';
            byY[y].items.push({ x: t.x, str });
          }

          const ys = Object.keys(byY).map(Number).sort((a,b)=>a-b);
          for (const y of ys) {
            const items = byY[y].items.sort((a,b)=>a.x-b.x);
            const lineText = items.map(i => i.str).join('').replace(/\s+/g,' ').trim();
            if (lineText) allLines.push({ text: lineText, pageIdx: pgIdx });
          }
        }

        const { questions, answerKey, enunciados } = parseICFES(allLines);
        resolve({ questions, answerKey, enunciados, totalPages: pages.length, source: 'pdf' });
      } catch(e) {
        reject(e);
      }
    });

    parser.on('pdfParser_dataError', e => reject(new Error(e.parserError || String(e))));
    parser.loadPDF(filePath);
  });
}

// ── Extract from DOCX ─────────────────────────────────────────────────────────
async function extractFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const rawText = result.value;
  const allLines = rawText.split('\n').map((text, i) => ({ text, pageIdx: 0 }));
  const { questions, answerKey, enunciados } = parseICFES(allLines);
  return { questions, answerKey, enunciados, totalPages: 1, source: 'docx' };
}

// ── Route ──────────────────────────────────────────────────────────────────────
router.post('/extract-pdf', adminCheck, uploadDoc.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, message: 'Archivo requerido (PDF, DOC o DOCX)' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const docUrl = '/uploads/docs/' + req.file.filename;

    let extracted;
    if (ext === '.pdf') {
      extracted = await extractFromPDF(filePath);
    } else if (ext === '.docx' || ext === '.doc') {
      extracted = await extractFromDocx(filePath);
    } else {
      return res.json({ success: false, message: 'Formato no soportado' });
    }

    const { questions, answerKey, enunciados, totalPages } = extracted;

    res.json({
      success: true,
      preguntas: questions,
      total: questions.length,
      answerKey: Object.fromEntries(Object.entries(answerKey).map(([k,v])=>[k,v])),
      enunciados,
      paginas: totalPages,
      pdfUrl: docUrl,
      formato: ext.slice(1).toUpperCase()
    });

  } catch (err) {
    console.error('Extract error:', err);
    res.json({ success: false, message: 'Error al procesar el archivo: ' + err.message });
  }
});

module.exports = router;

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const routes = { '/': 'host.html', '/host': 'host.html', '/play': 'player.html', '/join': 'player.html' };

  // 1. Entregar archivos HTML
  if (routes[urlPath]) {
    fs.readFile(path.join(__dirname, routes[urlPath]), (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 2. Entregar imágenes estáticas (EL FIX DEL LOGO)
  const ext = path.extname(urlPath).toLowerCase();
  const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  
  if (mimeTypes[ext]) {
    fs.readFile(path.join(__dirname, urlPath), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] });
      res.end(data);
    });
    return;
  }

  // 3. Si no es ni HTML ni imagen
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server });

let game = {
  status: 'lobby', pin: generatePIN(),
  players: {}, host: null, questions: [],
  currentQ: -1, questionTimer: null, timeLeft: 0, answers: {},
};

function generatePIN() { return Math.floor(100000 + Math.random() * 900000).toString(); }

function sendToHost(data) {
  if (game.host && game.host.readyState === 1) game.host.send(JSON.stringify(data));
}
function sendToPlayers(data) {
  const msg = JSON.stringify(data);
  Object.values(game.players).forEach(p => { if (p.ws?.readyState === 1) p.ws.send(msg); });
}
function getLeaderboard() {
  return Object.entries(game.players)
    .map(([id, p]) => ({ id, name: p.name, score: p.score, streak: p.streak, avatar: p.avatar }))
    .sort((a, b) => b.score - a.score).slice(0, 20);
}

function startQuestion(index) {
  if (index >= game.questions.length) { endGame(); return; }
  game.currentQ = index; game.status = 'question'; game.answers = {};
  const q = game.questions[index];
  const timeLimit = q.time || 20;
  game.timeLeft = timeLimit;
  const qtype = q.qtype || 'quiz';

  // Para puzzle, mandamos las piezas mezcladas al jugador
  let playerOptions = q.options;
  if (qtype === 'puzzle') {
    playerOptions = [...q.options].sort(() => Math.random() - 0.5);
  }

  sendToHost({ type: 'question_start', index, total: game.questions.length, question: q.question, options: q.options, correct: q.correct, time: timeLimit, image: q.image || null, points: q.points || 1000, qtype });
  sendToPlayers({ type: 'question_start', index, total: game.questions.length, question: q.question, options: playerOptions, time: timeLimit, image: q.image || null, qtype, scaleValue: q.scaleValue || null });

  clearInterval(game.questionTimer);
  game.questionTimer = setInterval(() => {
    game.timeLeft--;
    sendToHost({ type: 'timer', timeLeft: game.timeLeft });
    sendToPlayers({ type: 'timer', timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) { clearInterval(game.questionTimer); revealAnswer(); }
  }, 1000);
}

function revealAnswer() {
  game.status = 'answer';
  const q = game.questions[game.currentQ];
  const basePoints = q.points || 1000;
  const qtype = q.qtype || 'quiz';

  Object.entries(game.players).forEach(([id, player]) => {
    const ans = game.answers[id];
    let isCorrect = false;

    if (ans) {
      if (qtype === 'short') {
        // Comparación de texto sin distinción de mayúsculas/espacios
        const expected = (q.shortAnswer || q.options[0] || '').toLowerCase().trim();
        const given = (ans.text || '').toLowerCase().trim();
        isCorrect = given === expected;
      } else if (qtype === 'puzzle') {
        // Comparar el orden enviado con el orden correcto
        const correctOrder = JSON.stringify(q.options);
        const givenOrder = JSON.stringify(ans.order || []);
        isCorrect = givenOrder === correctOrder;
      } else if (qtype === 'scale') {
        // Permitir ±1 de margen en la escala
        const correct = q.scaleValue || (q.correct + 1);
        isCorrect = Math.abs((ans.choice + 1) - correct) <= 1;
      } else {
        // quiz y truefalse: comparar índice
        isCorrect = ans.choice === q.correct;
      }
    }

    let points = 0;
    if (isCorrect) {
      const speedRatio = ans.timeLeft / (q.time || 20);
      points = Math.round(basePoints * 0.5 + basePoints * 0.5 * speedRatio);
      const streakBonus = Math.min(player.streak * 50, 300);
      points += streakBonus;
      player.streak = (player.streak || 0) + 1;
    } else { player.streak = 0; }

    player.score = (player.score || 0) + points;
    player.lastAnswer = { choice: ans?.choice ?? -1, correct: isCorrect, points };

    // Texto de respuesta correcta según tipo
    let correctText = '';
    if (qtype === 'short') correctText = q.shortAnswer || q.options[0] || '';
    else if (qtype === 'puzzle') correctText = q.options.join(' → ');
    else if (qtype === 'scale') correctText = String(q.scaleValue || q.correct + 1);
    else correctText = q.options[q.correct];

    if (player.ws?.readyState === 1) {
      player.ws.send(JSON.stringify({ type: 'answer_result', correct: isCorrect, correctAnswer: q.correct, correctText, points, totalScore: player.score, streak: player.streak, noAnswer: !ans, explanation: q.explanation || null, qtype }));
    }
  });

  const optionCounts = (qtype === 'short' || qtype === 'puzzle')
    ? []
    : q.options.map((_, i) => Object.values(game.answers).filter(a => a.choice === i).length);

  let correctText = '';
  if (qtype === 'short') correctText = q.shortAnswer || q.options[0] || '';
  else if (qtype === 'puzzle') correctText = q.options.join(' → ');
  else if (qtype === 'scale') correctText = String(q.scaleValue || q.correct + 1);
  else correctText = q.options[q.correct];

  sendToHost({ type: 'answer_reveal', correct: q.correct, correctText, optionCounts, leaderboard: getLeaderboard(), explanation: q.explanation || null, answeredCount: Object.keys(game.answers).length, totalPlayers: Object.keys(game.players).length, qtype });
}

function endGame() {
  game.status = 'finished';
  clearInterval(game.questionTimer);
  const leaderboard = getLeaderboard();
  sendToHost({ type: 'game_over', leaderboard });
  sendToPlayers({ type: 'game_over', leaderboard });
}

function resetGame() {
  clearInterval(game.questionTimer);
  game.status = 'lobby'; game.pin = generatePIN();
  game.players = {}; game.questions = []; game.currentQ = -1; game.answers = {};
  sendToHost({ type: 'reset', pin: game.pin });
}

wss.on('connection', (ws) => {
  let clientId = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'host_connect') {
      game.host = ws;
      ws.send(JSON.stringify({ type: 'host_connected', pin: game.pin, status: game.status, playerCount: Object.keys(game.players).length, players: Object.entries(game.players).map(([id, p]) => ({ id, name: p.name, avatar: p.avatar })) }));
    }
    else if (msg.type === 'player_join') {
      if (game.status !== 'lobby') { ws.send(JSON.stringify({ type: 'join_error', message: 'El juego ya comenzó. Espera la siguiente ronda.' })); return; }
      if (msg.pin !== game.pin) { ws.send(JSON.stringify({ type: 'join_error', message: 'PIN incorrecto. Verifica el código.' })); return; }
      const name = (msg.name || '').trim().substring(0, 20);
      if (!name) { ws.send(JSON.stringify({ type: 'join_error', message: 'Escribe tu nombre para unirte.' })); return; }
      if (Object.values(game.players).some(p => p.name.toLowerCase() === name.toLowerCase())) { ws.send(JSON.stringify({ type: 'join_error', message: 'Ese nombre ya está en uso.' })); return; }
      clientId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      game.players[clientId] = { name, score: 0, streak: 0, ws, avatar: msg.avatar || '🎮', lastAnswer: null };
      ws.send(JSON.stringify({ type: 'join_ok', id: clientId, name, avatar: msg.avatar || '🎮' }));
      sendToHost({ type: 'player_joined', id: clientId, name, avatar: msg.avatar || '🎮', count: Object.keys(game.players).length });
    }
    else if (msg.type === 'player_answer') {
      if (game.status !== 'question' || !clientId || game.answers[clientId]) return;
      // Guardar según tipo: choice (índice), text (short), order (puzzle)
      game.answers[clientId] = {
        choice: msg.choice ?? -1,
        text: msg.text || null,
        order: msg.order || null,
        timeLeft: game.timeLeft
      };
      ws.send(JSON.stringify({ type: 'answer_received', choice: msg.choice }));
      sendToHost({ type: 'answer_in', count: Object.keys(game.answers).length, total: Object.keys(game.players).length });
      if (Object.keys(game.answers).length >= Object.keys(game.players).length) { clearInterval(game.questionTimer); revealAnswer(); }
    }
    else if (msg.type === 'host_set_questions') { game.questions = msg.questions; sendToHost({ type: 'questions_loaded', count: game.questions.length }); }
    else if (msg.type === 'host_start_game') {
      if (!game.questions.length) { sendToHost({ type: 'error', message: 'Carga preguntas primero' }); return; }
      if (!Object.keys(game.players).length) { sendToHost({ type: 'error', message: 'Necesitas al menos 1 jugador' }); return; }
      game.status = 'starting';
      sendToPlayers({ type: 'game_starting' });
      sendToHost({ type: 'game_starting' });
      setTimeout(() => startQuestion(0), 4000);
    }
    else if (msg.type === 'host_next_question') { clearInterval(game.questionTimer); startQuestion(game.currentQ + 1); }
    else if (msg.type === 'host_skip_timer') { clearInterval(game.questionTimer); revealAnswer(); }
    else if (msg.type === 'host_reset') { resetGame(); }
    else if (msg.type === 'host_kick') {
      if (game.players[msg.id]) {
        game.players[msg.id].ws?.send(JSON.stringify({ type: 'kicked' }));
        delete game.players[msg.id];
        sendToHost({ type: 'player_left', id: msg.id, count: Object.keys(game.players).length });
      }
    }
  });

  ws.on('close', () => {
    if (ws === game.host) { game.host = null; return; }
    if (clientId && game.players[clientId]) {
      const name = game.players[clientId].name;
      delete game.players[clientId];
      sendToHost({ type: 'player_left', id: clientId, name, count: Object.keys(game.players).length });
    }
  });
});

const { networkInterfaces } = require('os');
let localIP = 'TU_IP';
for (const nets of Object.values(networkInterfaces())) {
  for (const net of nets) { if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; } }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          🎯  QUIZZY — SERVIDOR ACTIVO            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  📺 Pantalla (PC/TV):  http://localhost:${PORT}        ║`);
  console.log(`║  📱 Jugadores (CEL):   http://${localIP}:${PORT}/play ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');
});
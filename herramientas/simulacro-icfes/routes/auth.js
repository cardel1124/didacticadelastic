const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../data/users.json');

function getUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { nombres, apellidos, documento, password, grado } = req.body;
    if (!nombres || !apellidos || !documento || !password || !grado) {
      return res.json({ success: false, message: 'Todos los campos son obligatorios.' });
    }
    const users = getUsers();
    if (users.find(u => u.documento === documento)) {
      return res.json({ success: false, message: 'Ya existe un usuario con ese documento.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      nombres,
      apellidos,
      documento,
      password: hash,
      grado,
      role: 'estudiante',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    res.json({ success: true, message: 'Registro exitoso. Ahora puedes iniciar sesión.' });
  } catch (err) {
    res.json({ success: false, message: 'Error en el servidor.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { documento, password } = req.body;

    // Admin: usuario y contraseña vienen de variables de entorno (ver .env.example)
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      console.warn('⚠️  ADMIN_PASSWORD no está configurada en el archivo .env. El acceso de administrador está deshabilitado hasta que la configures.');
    } else if (documento === ADMIN_USER && password === ADMIN_PASSWORD) {
      req.session.user = { id: 'admin', nombres: 'Administrador', role: 'admin', documento: ADMIN_USER };
      return res.json({ success: true, role: 'admin' });
    }

    const users = getUsers();
    const user = users.find(u => u.documento === documento);
    if (!user) return res.json({ success: false, message: 'Documento no registrado.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: 'Contraseña incorrecta.' });

    req.session.user = { id: user.id, nombres: user.nombres, apellidos: user.apellidos, documento: user.documento, grado: user.grado, role: 'estudiante' };
    res.json({ success: true, role: 'estudiante' });
  } catch (err) {
    res.json({ success: false, message: 'Error en el servidor.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;

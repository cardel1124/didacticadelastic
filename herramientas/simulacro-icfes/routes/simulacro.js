const express = require('express');
const router = express.Router();

router.get('/:id/presentar', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'estudiante') return res.redirect('/');
  res.sendFile(require('path').join(__dirname, '../public/presentar.html'));
});

module.exports = router;

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {prisma} = require('../db');
const { authRequired } = require('../middleware/auth');

const r = Router();

/** 
 * POST /auth/register
 * body: {name, email, password, role: "patient"|"provider", phone?}
 */

r.post('/register', async (req, res) => {
    try{
        const {name, email, password, role, phone} = req.body || {};
        if(!name || !email || !password || !['patient', 'provider'].includes(role)){
            return res.status(400).json({error: 'invalid_input'});
        }

        const existing = await prisma.user.findUnique({where: {email: email.toLowerCase()}});
        if (existing){
            return res.status(409).json({error: 'email_exists'});
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                role,
                passwordHash,
                phone
            }
        });

        res.status(201).json({id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone});
    }
    catch(e){
        console.error(e);
        res.status(500).json({error: 'register_failed'});
    }
});

/**
 * POST /auth/login
 * body: { email, password }
 * returns: { token, user }
 */
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'invalid_input' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'login_failed' });
  }
});

/** GET /auth/me (requires token) */
r.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user) return res.status(401).json({ error: 'user_not_found' });
  res.json({ id: user.id, email: user.email, role: user.role, name: user.name });
});

module.exports = r;
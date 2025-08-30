// src/routes/auth.js
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {prisma} = require('../db');
const { authRequired } = require('../middleware/auth');

const r = Router();

/** 
 * POST /auth/register
 * body: {name, email, password, role: "patient"|"provider", phone?, speciality?, experience?, description?, appointmentFee?}
 */
r.post('/register', async (req, res) => {
    try{
        const {name, email, password, role, phone, speciality, experience, description, appointmentFee} = req.body || {};
        
        if(!name || !email || !password || !['patient', 'provider'].includes(role)){
            return res.status(400).json({error: 'invalid_input'});
        }

        // Additional validation for providers
        if(role === 'provider') {
            if(!speciality || !appointmentFee) {
                return res.status(400).json({error: 'provider_missing_fields'});
            }
            
            const fee = parseFloat(appointmentFee);
            if(isNaN(fee) || fee < 10 || fee > 1000) {
                return res.status(400).json({error: 'invalid_appointment_fee'});
            }
        }

        const existing = await prisma.user.findUnique({where: {email: email.toLowerCase()}});
        if (existing){
            return res.status(409).json({error: 'email_exists'});
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Use transaction to create user and provider record
        const result = await prisma.$transaction(async (tx) => {
            // Create user
            const user = await tx.user.create({
                data: {
                    name,
                    email: email.toLowerCase(),
                    role,
                    passwordHash,
                    phone
                }
            });

            // If user is a provider, create provider record
            if(role === 'provider') {
                await tx.provider.create({
                    data: {
                        userId: user.id,
                        speciality,
                        experience: experience || '1 Years',
                        description: description || `${name} is a qualified ${speciality} with professional medical experience.`,
                        appointmentFee: parseFloat(appointmentFee)
                    }
                });
            }

            return user;
        });

        res.status(201).json({
            id: result.id, 
            name: result.name, 
            email: result.email, 
            role: result.role, 
            phone: result.phone
        });
    }
    catch(e){
        console.error('Registration error:', e);
        if(e.code === 'P2002') {
            return res.status(409).json({error: 'email_exists'});
        }
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

    const user = await prisma.user.findUnique({ 
        where: { email: email.toLowerCase() },
        include: {
            provider: {
                select: {
                    id: true,
                    speciality: true,
                    experience: true,
                    appointmentFee: true
                }
            }
        }
    });
    
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name 
    };

    // Add provider info if user is a provider
    if(user.role === 'provider' && user.provider) {
        userResponse.speciality = user.provider.speciality;
        userResponse.experience = user.provider.experience;
        userResponse.appointmentFee = user.provider.appointmentFee;
    }

    res.json({ token, user: userResponse });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'login_failed' });
  }
});

/** GET /auth/me (requires token) */
r.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({ 
    where: { id: req.auth.userId },
    include: {
        provider: {
            select: {
                id: true,
                speciality: true,
                experience: true,
                appointmentFee: true
            }
        }
    }
  });
  
  if (!user) return res.status(401).json({ error: 'user_not_found' });
  
  const userResponse = { 
    id: user.id, 
    email: user.email, 
    role: user.role, 
    name: user.name 
  };

  // Add provider info if user is a provider
  if(user.role === 'provider' && user.provider) {
    userResponse.speciality = user.provider.speciality;
    userResponse.experience = user.provider.experience;
    userResponse.appointmentFee = user.provider.appointmentFee;
  }

  res.json(userResponse);
});

module.exports = r;
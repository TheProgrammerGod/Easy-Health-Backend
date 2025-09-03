// src/index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/providers');
const appointmentRoutes = require('./routes/appointments');
const { authRequired } = require('./middleware/auth');
const documentRoutes = require('./routes/documents');
// const medicalRecordsRoutes = require('./routes/medicalRecords');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({limit: '2mb'}));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.use('/auth', authRoutes);

//all routes below this require auth
app.use(authRequired);
app.use('/providers', providerRoutes);
app.use('/appointments', appointmentRoutes); // ✅ Now actually using the appointments routes
app.use('/documents', documentRoutes);
// app.use('/medical-records', medicalRecordsRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`))
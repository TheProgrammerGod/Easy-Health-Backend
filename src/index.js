// src/index.js
require('dotenv').config();

console.log('=== STARTUP DEBUG INFO ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('Current working directory:', process.cwd());
console.log('Node version:', process.version);

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
app.use('/appointments', appointmentRoutes); // 
app.use('/documents', documentRoutes);
// app.use('/medical-records', medicalRecordsRoutes);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running on port ${port}`))

// Handle process termination gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// src/index.js - Debug version

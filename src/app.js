/**
 * TWOINE - Main API Server
 * Express server principal pour la plateforme Twoine
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter = require('./routes/index');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/twoine';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

/**
 * Logger avec timestamp
 */
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [API] [${level.toUpperCase()}] ${message}`);
}

/**
 * Configuration de la sécurité (Helmet)
 */
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

/**
 * Configuration CORS
 */
const corsOptions = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

/**
 * Rate limiting
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX || 1000,
    message: { success: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

/**
 * Body parsers
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Health check endpoint (avant les routes)
 */
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
        success: true,
        status: 'ok',
        service: 'twoine-api',
        version: process.env.TWOINE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV,
        database: dbStatus,
    });
});

/**
 * Routes API principales
 */
app.use('/api', apiRouter);

/**
 * Route racine
 */
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Twoine API Server',
        version: process.env.TWOINE_VERSION || '1.0.0',
        documentation: '/api',
    });
});

/**
 * Gestion des routes non trouvées
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
    });
});

/**
 * Gestion globale des erreurs
 */
app.use((err, req, res, next) => {
    log('error', `Unhandled error: ${err.message}`);
    console.error(err.stack);

    const status = err.status || err.statusCode || 500;
    const message = NODE_ENV === 'production' ? 'Internal server error' : err.message;

    res.status(status).json({
        success: false,
        error: message,
        ...(NODE_ENV !== 'production' && { stack: err.stack }),
    });
});

/**
 * Connexion à MongoDB
 */
async function connectDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            maxPoolSize: 10,
            minPoolSize: 2,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        log('info', `Connected to MongoDB: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
        return true;
    } catch (error) {
        log('error', `MongoDB connection failed: ${error.message}`);
        return false;
    }
}

/**
 * Gestion de la fermeture propre
 */
async function gracefulShutdown(signal) {
    log('info', `Received ${signal}, starting graceful shutdown...`);

    try {
        await mongoose.connection.close();
        log('info', 'MongoDB connection closed');
    } catch (error) {
        log('error', `Error closing MongoDB: ${error.message}`);
    }

    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Gestion des erreurs non capturées
 */
process.on('unhandledRejection', (reason, promise) => {
    log('error', `Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
    log('error', `Uncaught Exception: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});

/**
 * Démarrage du serveur
 */
async function startServer() {
    try {
        const dbConnected = await connectDatabase();
        
        if (!dbConnected) {
            log('error', 'Failed to connect to database. Retrying in 5 seconds...');
            setTimeout(startServer, 5000);
            return;
        }

        const server = app.listen(PORT, '0.0.0.0', () => {
            log('info', `Twoine API Server listening on port ${PORT}`);
            log('info', `Environment: ${NODE_ENV}`);
            log('info', `Health check: http://localhost:${PORT}/health`);
            log('info', `API endpoints: http://localhost:${PORT}/api`);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                log('error', `Port ${PORT} is already in use`);
            } else {
                log('error', `Server error: ${error.message}`);
            }
            process.exit(1);
        });

    } catch (error) {
        log('error', `Failed to start server: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

startServer();

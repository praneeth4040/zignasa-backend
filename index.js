// Load environment variables early
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const routes = require('./routes/routes');
const { testConnection } = require('./services/database');

const app = express();

// Middleware
app.use(helmet()); // security headers
app.use(compression()); // gzip responses
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Basic rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    const health = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
    };
    res.status(200).json(health);
});

app.use('/', routes);

const PORT = process.env.PORT || 3000;

// Test Supabase connection at server startup
testConnection();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
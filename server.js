const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const aviatorRoutes = require('./src/routes/Aviator/aviatorRoutes');
const aviatorWebSocketService = require('./src/services/Aviator/webSocketService');
const resultMonitoringService = require('./src/services/resultMonitoringService');
const winston = require('winston');
const db = require('./src/config/database');

// Función para inicializar la base de datos
async function initializeDatabase() {
  try {
    console.log('🔍 Verificando tablas de la base de datos...');
    
    // Verificar si la tabla bookmakers existe
    const bookmakersCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'bookmakers'
      );
    `);
    
    if (!bookmakersCheck.rows[0].exists) {
      console.log('📝 Creando tablas de la base de datos...');
      
      // Leer y ejecutar el script SQL completo
      const sql = fs.readFileSync('./create_all_tables.sql', 'utf8');
      await db.query(sql);
      
      console.log('✅ Base de datos inicializada correctamente!');
    } else {
      console.log('✅ Base de datos ya está configurada');
    }
  } catch (error) {
    console.error('❌ Error inicializando la base de datos:', error.message);
    // No salir del proceso, solo loggear el error
  }
}

const app = express();
const server = http.createServer(app);

// Configuración de CORS para Railway
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://myluckystatsapp.vercel.app', process.env.FRONTEND_URL].filter(Boolean)
    : true, // En desarrollo permitir cualquier origen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: false, // No requerir credenciales
};

const io = new Server(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos
app.set('io', io);

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'app.log' }),
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});

app.use((req, res, next) => {
  logger.info(`Solicitud recibida: ${req.method} ${req.url}`, { origin: req.get('origin') });
  next();
});

// Rutas
app.use('/api/aviator', aviatorRoutes);


io.on('connection', (socket) => {
  socket.on('joinBookmaker', (bookmakerId) => {
    socket.join(`bookmaker:${bookmakerId}`);
  });




  socket.on('disconnect', () => {});
});

aviatorWebSocketService.initializeConnections(io);

// Iniciar monitoreo de resultados
resultMonitoringService.startMonitoring();

// Configuración de puerto para Railway
const PORT = process.env.PORT || 3001;

// Ruta de health check para Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Inicializar la base de datos y luego iniciar el servidor
async function startServer() {
  await initializeDatabase();
  
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Servidor corriendo en el puerto ${PORT}`);
    logger.info(`Monitoreo de resultados iniciado`);
    logger.info(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
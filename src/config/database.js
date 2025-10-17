const { Pool } = require('pg');

// Configuración de la base de datos para Render
const dbConfig = {
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || 'interchange.proxy.rlwy.net',
  database: process.env.DATABASE_NAME || 'railway',
  password: process.env.DATABASE_PASSWORD || 'lhcvYzvMJQJZrfinsIxMuXaeXuvaistQ',
  port: process.env.DATABASE_PORT || 18949,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuración adicional para Render
  max: 20, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000, // Tiempo de inactividad antes de cerrar conexión
  connectionTimeoutMillis: 2000, // Tiempo de espera para nueva conexión
};

// Configura el pool de conexiones
const pool = new Pool(dbConfig);

// Exportamos una función para hacer consultas
module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      throw error;
    }
  },
};

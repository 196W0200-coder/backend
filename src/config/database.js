const { Pool } = require('pg');

const dbConfig = {
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || '187.146.140.209', // Tu IP pública
  database: process.env.DATABASE_NAME || 'myLuckyStats',
  password: process.env.DATABASE_PASSWORD || 'Amaro23vic*',
  port: process.env.DATABASE_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Aumentado para conexiones remotas
};

const pool = new Pool(dbConfig);

pool.on('connect', () => {
  console.log('Conexión a BD establecida en:', dbConfig.host);
});

pool.on('error', (err) => {
  console.error('Error en el pool:', err);
});

module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error('Error en consulta:', error);
      throw error;
    }
  },
};

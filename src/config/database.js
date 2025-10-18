/*const { Pool } = require('pg');

const dbConfig = {
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || 'nozomi.proxy.rlwy.net',
  database: process.env.DATABASE_NAME || 'railway',
  password: process.env.DATABASE_PASSWORD || 'TSnJyXqZPeGbFIrlOnObkENyDWoibjNN',
  port: process.env.DATABASE_PORT || 17306,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuración adicional para el pool
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


*/







const { Pool } = require('pg');

const dbConfig = {
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || 'localhost', // o '127.0.0.1' en lugar de '::1'
  database: process.env.DATABASE_NAME || 'myLuckyStats',
  password: process.env.DATABASE_PASSWORD || 'Amaro23vic*',
  port: process.env.DATABASE_PORT || 5432,
  // SSL solo es necesario para conexiones remotas/cloud
  // ssl: {
  //   rejectUnauthorized: false
  // },
  // Configuración adicional para el pool
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Configura el pool de conexiones
const pool = new Pool(dbConfig);

// Manejo de eventos del pool para debugging
pool.on('connect', () => {
  console.log('Conexión a la base de datos establecida');
});

pool.on('error', (err) => {
  console.error('Error en el pool de conexiones:', err);
});

// Exportamos una función para hacer consultas
module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error('Error en la consulta:', error);
      throw error;
    }
  },
  
  // Método adicional para obtener el cliente directamente si lo necesitas
  /* getClient: async () => {
    return await pool.connect();
  },
  
  // Método para cerrar el pool (útil al apagar la aplicación)
  close: async () => {
    await pool.end();
  } */
};

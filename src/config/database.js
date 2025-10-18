const { Pool } = require('pg');

const dbConfig = {
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || 'interchange.proxy.rlwy.net',
  database: process.env.DATABASE_NAME || 'railway',
  password: process.env.DATABASE_PASSWORD || 'dmcySQjKSfDQEAOgDnUkyPypxIxugoJq',
  port: process.env.DATABASE_PORT || 42724,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuración adicional para el pool
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Aumentado para conexiones cloud
};

// Configura el pool de conexiones
const pool = new Pool(dbConfig);

// Manejo de eventos del pool para debugging
pool.on('connect', () => {
  console.log('✅ Conexión a Railway establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error en el pool de conexiones:', err);
});

pool.on('acquire', () => {
  console.log('🔗 Cliente adquirido del pool');
});

// Exportamos una función para hacer consultas
module.exports = {
  query: async (text, params) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log(`✅ Consulta ejecutada en ${duration}ms`);
      return result;
    } catch (error) {
      console.error('❌ Error en la consulta:', {
        error: error.message,
        query: text,
        params: params
      });
      throw error;
    }
  },
  
  // Método para obtener cliente directamente si lo necesitas
  getClient: async () => {
    const client = await pool.connect();
    console.log('🔗 Cliente conectado directamente');
    return client;
  },
  
  // Método para probar la conexión
  testConnection: async () => {
    try {
      const result = await pool.query('SELECT NOW() as current_time');
      console.log('✅ Test de conexión exitoso:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('❌ Test de conexión fallido:', error);
      return false;
    }
  },
  
  // Método para cerrar el pool (útil al apagar la aplicación)
  close: async () => {
    await pool.end();
    console.log('🔒 Pool de conexiones cerrado');
  }
};

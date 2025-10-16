const fs = require('fs');
const db = require('./src/config/database');

async function migrateDatabase() {
  try {
    console.log('🔍 Conectando a la base de datos...');
    
    // Probar la conexión
    await db.query('SELECT NOW()');
    console.log('✅ Conexión exitosa a la base de datos');
    
    // Leer el script SQL completo
    console.log('📝 Leyendo script SQL...');
    const sql = fs.readFileSync('./create_all_tables.sql', 'utf8');
    
    // Ejecutar el SQL
    console.log('🚀 Ejecutando migración...');
    await db.query(sql);
    
    console.log('✅ ¡Migración completada exitosamente!');
    console.log('📊 Tablas creadas:');
    console.log('  - bookmakers');
    console.log('  - game_rounds');
    console.log('  - bookmaker_history');
    console.log('  - bookmaker_monitoring');
    console.log('  - Índices y triggers');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
}

migrateDatabase();

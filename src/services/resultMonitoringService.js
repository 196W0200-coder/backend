const db = require('../config/database');

class ResultMonitoringService {
  constructor() {
    this.lastResults = new Map(); // bookmaker_id -> { round_id, max_multiplier, timestamp, last_check }
    this.monitoringInterval = null;
    this.checkInterval = 30000; // Verificar cada 30 segundos
  }

  // Iniciar monitoreo
  startMonitoring() {
    console.log('🔄 Iniciando monitoreo de resultados de bookmakers...');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.checkAllBookmakers();
    }, this.checkInterval);
  }

  // Detener monitoreo
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('⏹️ Monitoreo de resultados detenido');
  }

  // Verificar todos los bookmakers
  async checkAllBookmakers() {
    try {
      // Obtener bookmakers activos
      const bookmakers = await db.query('SELECT id, name FROM bookmakers WHERE active = true');
      
      for (const bookmaker of bookmakers.rows) {
        await this.checkBookmakerResult(bookmaker.id, bookmaker.name);
      }
    } catch (error) {
      console.error('Error checking all bookmakers:', error);
    }
  }

  // Verificar resultado de un bookmaker específico
  async checkBookmakerResult(bookmakerId, bookmakerName) {
    try {
      // Obtener último resultado de la API
      const apiResult = await this.fetchLastResult(bookmakerId);
      
      if (!apiResult) {
        console.log(`❌ No se pudo obtener resultado para bookmaker ${bookmakerId}`);
        return;
      }

      const currentResult = {
        round_id: apiResult.round_id,
        max_multiplier: apiResult.max_multiplier,
        timestamp: apiResult.timestamp,
        last_check: new Date()
      };

      // Obtener resultado anterior
      const lastResult = this.lastResults.get(bookmakerId);

      if (!lastResult) {
        // Primera verificación
        this.lastResults.set(bookmakerId, currentResult);
        console.log(`📊 Primera verificación para ${bookmakerName} (ID: ${bookmakerId})`);
        return;
      }

      // Verificar si hay cambios
      const hasChanged = this.hasResultChanged(lastResult, currentResult);

      if (hasChanged) {
        console.log(`✅ ${bookmakerName} (ID: ${bookmakerId}): Nuevo resultado detectado`);
        console.log(`   Round ID: ${lastResult.round_id} → ${currentResult.round_id}`);
        console.log(`   Multiplier: ${lastResult.max_multiplier} → ${currentResult.max_multiplier}`);
        
        // Actualizar resultado
        this.lastResults.set(bookmakerId, currentResult);
        
        // Actualizar base de datos
        await this.updateBookmakerMonitoring(bookmakerId, currentResult);
      } else {
        // No hay cambios, verificar tiempo sin cambios
        const timeWithoutChanges = this.getTimeWithoutChanges(lastResult.last_check);
        console.log(`⏰ ${bookmakerName} (ID: ${bookmakerId}): Sin cambios por ${timeWithoutChanges}`);
        
        // Actualizar último check
        this.lastResults.set(bookmakerId, {
          ...lastResult,
          last_check: new Date()
        });
      }

    } catch (error) {
      console.error(`Error checking bookmaker ${bookmakerId}:`, error);
    }
  }

  // Obtener último resultado de la API
  async fetchLastResult(bookmakerId) {
    try {
      const response = await fetch(`http://localhost:3001/api/aviator/rounds/${bookmakerId}?limit=1`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.data && data.data.length > 0) {
        return data.data[0];
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching result for bookmaker ${bookmakerId}:`, error);
      return null;
    }
  }

  // Verificar si el resultado ha cambiado
  hasResultChanged(lastResult, currentResult) {
    return (
      lastResult.round_id !== currentResult.round_id ||
      lastResult.max_multiplier !== currentResult.max_multiplier
    );
  }

  // Obtener tiempo sin cambios
  getTimeWithoutChanges(lastCheck) {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - lastCheck.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'menos de 1 min';
    if (diffInMinutes < 60) return `${diffInMinutes} min`;
    
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    
    if (hours < 24) {
      return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
    }
    
    const days = Math.floor(hours / 24);
    return `${days} días`;
  }

  // Actualizar monitoreo en base de datos
  async updateBookmakerMonitoring(bookmakerId, result) {
    try {
      await db.query(`
        UPDATE bookmaker_monitoring 
        SET 
          last_round_id = $1,
          last_max_multiplier = $2,
          last_round_time = $3,
          updated_at = NOW()
        WHERE bookmaker_id = $4
      `, [
        result.round_id,
        result.max_multiplier,
        result.timestamp,
        bookmakerId
      ]);
    } catch (error) {
      console.error(`Error updating monitoring for bookmaker ${bookmakerId}:`, error);
    }
  }

  // Obtener estado de monitoreo para el frontend
  getMonitoringStatus() {
    const status = [];
    
    for (const [bookmakerId, result] of this.lastResults) {
      const timeWithoutChanges = this.getTimeWithoutChanges(result.last_check);
      const minutesWithoutChanges = Math.floor((new Date().getTime() - result.last_check.getTime()) / (1000 * 60));
      
      status.push({
        bookmaker_id: bookmakerId,
        last_round_id: result.round_id,
        last_max_multiplier: result.max_multiplier,
        last_round_time: result.timestamp,
        last_check: result.last_check,
        time_without_changes: timeWithoutChanges,
        minutes_without_changes: minutesWithoutChanges,
        has_stale_data: minutesWithoutChanges >= 5
      });
    }
    
    return status;
  }

  // Obtener estado de un bookmaker específico
  getBookmakerStatus(bookmakerId) {
    const result = this.lastResults.get(bookmakerId);
    if (!result) return null;
    
    const timeWithoutChanges = this.getTimeWithoutChanges(result.last_check);
    const minutesWithoutChanges = Math.floor((new Date().getTime() - result.last_check.getTime()) / (1000 * 60));
    
    return {
      bookmaker_id: bookmakerId,
      last_round_id: result.round_id,
      last_max_multiplier: result.max_multiplier,
      last_round_time: result.timestamp,
      last_check: result.last_check,
      time_without_changes: timeWithoutChanges,
      minutes_without_changes: minutesWithoutChanges,
      has_stale_data: minutesWithoutChanges >= 5
    };
  }
}

module.exports = new ResultMonitoringService();

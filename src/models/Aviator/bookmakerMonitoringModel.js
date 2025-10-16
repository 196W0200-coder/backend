const db = require('../../config/database');

const BookmakerMonitoring = {
  // Crear o actualizar registro de monitoreo
  async upsertMonitoring(bookmakerId, data) {
    const {
      connectionStatus = 'DISCONNECTED',
      lastConnectionTime = null,
      lastDisconnectionTime = null,
      lastRoundId = null,
      lastMaxMultiplier = null,
      lastRoundTime = null
    } = data;

    const query = `
      INSERT INTO bookmaker_monitoring (
        bookmaker_id, connection_status, last_connection_time, 
        last_disconnection_time, last_round_id, last_max_multiplier, last_round_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (bookmaker_id) DO UPDATE SET
        connection_status = EXCLUDED.connection_status,
        last_connection_time = EXCLUDED.last_connection_time,
        last_disconnection_time = EXCLUDED.last_disconnection_time,
        last_round_id = EXCLUDED.last_round_id,
        last_max_multiplier = EXCLUDED.last_max_multiplier,
        last_round_time = EXCLUDED.last_round_time,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      bookmakerId,
      connectionStatus,
      lastConnectionTime,
      lastDisconnectionTime,
      lastRoundId,
      lastMaxMultiplier,
      lastRoundTime
    ];

    const { rows } = await db.query(query, values);
    return rows[0];
  },

  // Actualizar estado de conexión
  async updateConnectionStatus(bookmakerId, status) {
    const now = new Date();
    const updateData = {
      connectionStatus: status,
      lastConnectionTime: status === 'CONNECTED' ? now : null,
      lastDisconnectionTime: status === 'DISCONNECTED' ? now : null
    };

    return await this.upsertMonitoring(bookmakerId, updateData);
  },

  // Actualizar información de última ronda
  async updateLastRound(bookmakerId, roundId, maxMultiplier) {
    const now = new Date();
    const updateData = {
      lastRoundId: roundId,
      lastMaxMultiplier: maxMultiplier,
      lastRoundTime: now
    };

    return await this.upsertMonitoring(bookmakerId, updateData);
  },

  // Obtener estadísticas de monitoreo para dashboard
  async getDashboardStats() {
    const query = `
      SELECT 
        b.id,
        b.name,
        bm.connection_status,
        bm.last_connection_time,
        bm.last_disconnection_time,
        bm.last_round_id,
        bm.last_max_multiplier,
        bm.last_round_time,
        bm.total_rounds_today,
        bm.average_multiplier,
        bm.uptime_percentage,
        CASE 
          WHEN bm.last_round_time IS NULL THEN 'Nunca'
          WHEN bm.last_round_time > NOW() - INTERVAL '1 minute' THEN 'Hace menos de 1 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '5 minutes' THEN 'Hace menos de 5 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '15 minutes' THEN 'Hace menos de 15 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '1 hour' THEN 'Hace menos de 1 hora'
          ELSE 'Hace más de 1 hora'
        END as last_round_ago,
        CASE 
          WHEN bm.connection_status = 'CONNECTED' THEN '🟢 Conectado'
          WHEN bm.connection_status = 'CONNECTING' THEN '🟡 Conectando'
          ELSE '🔴 Desconectado'
        END as status_display
      FROM bookmakers b
      LEFT JOIN bookmaker_monitoring bm ON b.id = bm.bookmaker_id
      WHERE b.active = true
      ORDER BY bm.last_round_time DESC NULLS LAST
    `;

    const { rows } = await db.query(query);
    return rows;
  },

  // Obtener último resultado de un bookmaker específico
  async getLastRoundForBookmaker(bookmakerId) {
    const query = `
      SELECT 
        round_id,
        max_multiplier,
        timestamp,
        bets_count,
        total_bet_amount,
        online_players,
        total_cashout,
        casino_profit
      FROM game_rounds 
      WHERE bookmaker_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;

    const { rows } = await db.query(query, [bookmakerId]);
    return rows[0] || null;
  },

  // Obtener estadísticas de monitoreo con último resultado en tiempo real
  async getDashboardStatsWithLastRounds() {
    // Primero obtener los bookmakers activos
    const bookmakersQuery = `
      SELECT 
        b.id,
        b.name,
        bm.connection_status,
        bm.last_connection_time,
        bm.last_disconnection_time,
        bm.last_round_id,
        bm.last_max_multiplier,
        bm.last_round_time,
        bm.total_rounds_today,
        bm.average_multiplier,
        bm.uptime_percentage,
        CASE 
          WHEN bm.last_round_time IS NULL THEN 'Nunca'
          WHEN bm.last_round_time > NOW() - INTERVAL '1 minute' THEN 'Hace menos de 1 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '5 minutes' THEN 'Hace menos de 5 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '15 minutes' THEN 'Hace menos de 15 min'
          WHEN bm.last_round_time > NOW() - INTERVAL '1 hour' THEN 'Hace menos de 1 hora'
          ELSE 'Hace más de 1 hora'
        END as last_round_ago,
        CASE 
          WHEN bm.connection_status = 'CONNECTED' THEN '🟢 Conectado'
          WHEN bm.connection_status = 'CONNECTING' THEN '🟡 Conectando'
          ELSE '🔴 Desconectado'
        END as status_display
      FROM bookmakers b
      LEFT JOIN bookmaker_monitoring bm ON b.id = bm.bookmaker_id
      WHERE b.active = true
      ORDER BY bm.last_round_time DESC NULLS LAST
    `;

    const { rows: bookmakers } = await db.query(bookmakersQuery);
    
    // Para cada bookmaker, obtener el último resultado
    const bookmakersWithLastRounds = await Promise.all(
      bookmakers.map(async (bookmaker) => {
        const lastRound = await this.getLastRoundForBookmaker(bookmaker.id);
        return {
          ...bookmaker,
          last_round_data: lastRound
        };
      })
    );

    return bookmakersWithLastRounds;
  },

  // Obtener estadísticas generales
  async getGeneralStats() {
    const query = `
      SELECT 
        COUNT(*) as total_bookmakers,
        COUNT(CASE WHEN bm.connection_status = 'CONNECTED' THEN 1 END) as connected_bookmakers,
        COUNT(CASE WHEN bm.connection_status = 'DISCONNECTED' THEN 1 END) as disconnected_bookmakers,
        COUNT(CASE WHEN bm.connection_status = 'CONNECTING' THEN 1 END) as connecting_bookmakers,
        AVG(bm.uptime_percentage) as average_uptime,
        SUM(bm.total_rounds_today) as total_rounds_today,
        AVG(bm.average_multiplier) as average_multiplier_all
      FROM bookmakers b
      LEFT JOIN bookmaker_monitoring bm ON b.id = bm.bookmaker_id
      WHERE b.active = true
    `;

    const { rows } = await db.query(query);
    return rows[0];
  },

  // Actualizar estadísticas diarias
  async updateDailyStats(bookmakerId) {
    const query = `
      UPDATE bookmaker_monitoring 
      SET 
        total_rounds_today = (
          SELECT COUNT(*) 
          FROM game_rounds 
          WHERE bookmaker_id = $1 
          AND DATE(timestamp) = CURRENT_DATE
        ),
        average_multiplier = (
          SELECT AVG(max_multiplier) 
          FROM game_rounds 
          WHERE bookmaker_id = $1 
          AND DATE(timestamp) = CURRENT_DATE
        )
      WHERE bookmaker_id = $1
    `;

    await db.query(query, [bookmakerId]);
  },

  // Obtener historial de conexiones reciente
  async getRecentConnectionHistory(bookmakerId, limit = 10) {
    const query = `
      SELECT 
        connection_status,
        last_connection_time,
        last_disconnection_time,
        last_round_time,
        last_max_multiplier,
        updated_at
      FROM bookmaker_monitoring 
      WHERE bookmaker_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `;

    const { rows } = await db.query(query, [bookmakerId, limit]);
    return rows;
  }
};

module.exports = BookmakerMonitoring;

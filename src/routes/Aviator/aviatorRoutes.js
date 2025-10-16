const express = require('express');
   const router = express.Router();
const db = require('../../config/database');
const webSocketService = require('../../services/Aviator/webSocketService');
const BookmakerHistoryModel = require('../../models/Aviator/bookmakerHistoryModel');
const BookmakerMonitoring = require('../../models/Aviator/bookmakerMonitoringModel');
const resultMonitoringService = require('../../services/resultMonitoringService');

  router.get('/bookmakers', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT b.*
        FROM bookmakers b
        ORDER BY b.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching bookmakers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

   router.get('/bookmakers/:id', async (req, res) => {
     const { id } = req.params;
     try {
       const result = await db.query('SELECT * FROM bookmakers WHERE id = $1', [id]);
       if (result.rows.length === 0) {
         return res.status(404).json({ error: 'Bookmaker not found' });
       }
       res.json(result.rows[0]);
     } catch (error) {
       console.error('Error fetching bookmaker:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   router.post('/bookmakers', async (req, res) => {
     const { name, description, url_image, recomendado, active, url_websocket, first_message, second_message, third_message } = req.body;
     try {
       const result = await db.query(
         'INSERT INTO bookmakers (name, description, url_image, recomendado, active, url_websocket, first_message, second_message, third_message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
         [name, description, url_image, recomendado || false, active !== false, url_websocket, first_message, second_message, third_message]
       );
       
       const newBookmaker = result.rows[0];
       
       // Registrar en historial
       try {
         await BookmakerHistoryModel.createHistoryEntry(
           newBookmaker.id, 
           'created', 
           'name', 
           null, 
           name
         );
       } catch (historyError) {
         console.error('Error creating history entry:', historyError);
         // No fallar la creación si hay error en historial
       }
       
       res.status(201).json(newBookmaker);
     } catch (error) {
       console.error('Error creating bookmaker:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   router.put('/bookmakers/:id', async (req, res) => {
     const { id } = req.params;
     const { name, description, url_image, recomendado, active, url_websocket, first_message, second_message, third_message } = req.body;
     try {
       // Obtener datos anteriores para comparar
       const oldResult = await db.query('SELECT * FROM bookmakers WHERE id = $1', [id]);
       if (oldResult.rows.length === 0) {
         return res.status(404).json({ error: 'Bookmaker not found' });
       }
       const oldData = oldResult.rows[0];

       const result = await db.query(
         'UPDATE bookmakers SET name = $1, description = $2, url_image = $3, recomendado = $4, active = $5, url_websocket = $6, first_message = $7, second_message = $8, third_message = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10 RETURNING *',
         [name, description, url_image, recomendado, active, url_websocket, first_message, second_message, third_message, id]
       );
       
       const newData = result.rows[0];

       // Registrar cambios en historial
       try {
         const fieldsToCheck = ['name', 'description', 'url_image', 'recomendado', 'active', 'url_websocket', 'first_message', 'second_message', 'third_message'];
         
         for (const field of fieldsToCheck) {
           if (oldData[field] !== newData[field]) {
             await BookmakerHistoryModel.createHistoryEntry(
               id, 
               'updated', 
               field, 
               oldData[field], 
               newData[field]
             );
           }
         }
       } catch (historyError) {
         console.error('Error creating history entry:', historyError);
         // No fallar la actualización si hay error en historial
       }

       // Reiniciar conexiones WebSocket después de actualizar bookmaker
       try {
         const io = req.app.get('io');
         if (io) {
           await webSocketService.resetConnections(io);
           console.log(`[Bookmaker Update] Conexiones WebSocket reiniciadas después de actualizar bookmaker ${id}`);
         }
       } catch (wsError) {
         console.error('Error reiniciando conexiones WebSocket:', wsError);
         // No fallar la actualización si hay error en WebSocket
       }

       res.json(newData);
     } catch (error) {
       console.error('Error updating bookmaker:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   router.delete('/bookmakers/:id', async (req, res) => {
     const { id } = req.params;
     try {
       // Obtener datos antes de eliminar para historial
       const oldResult = await db.query('SELECT * FROM bookmakers WHERE id = $1', [id]);
       if (oldResult.rows.length === 0) {
         return res.status(404).json({ error: 'Bookmaker not found' });
       }
       const oldData = oldResult.rows[0];

       const result = await db.query('DELETE FROM bookmakers WHERE id = $1 RETURNING *', [id]);
       
       // Registrar eliminación en historial
       try {
         await BookmakerHistoryModel.createHistoryEntry(
           id, 
           'deleted', 
           'bookmaker', 
           oldData.name, 
           null
         );
       } catch (historyError) {
         console.error('Error creating history entry:', historyError);
         // No fallar la eliminación si hay error en historial
       }
       
       res.json({ message: 'Bookmaker deleted successfully' });
     } catch (error) {
       console.error('Error deleting bookmaker:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   router.get('/status', async (req, res) => {
     try {
       const connectionStatus = webSocketService.getConnectionStatus();
       const bookmakers = await db.query('SELECT id, name FROM bookmakers');
       
       const statusWithNames = connectionStatus.map(conn => {
         const bookmaker = bookmakers.rows.find(b => b.id === conn.bookmakerId);
         return {
           ...conn,
           bookmakerName: bookmaker ? bookmaker.name : 'Unknown'
         };
       });

       const totalBookmakers = bookmakers.rows.length;
       const connectedBookmakers = connectionStatus.filter(conn => conn.status === 'CONNECTED').length;
       const disconnectedBookmakers = totalBookmakers - connectedBookmakers;

       res.json({
         totalBookmakers,
         connectedBookmakers,
         disconnectedBookmakers,
         connections: statusWithNames
       });
     } catch (error) {
       console.error('Error fetching WebSocket status:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   // Endpoint para reiniciar conexiones WebSocket manualmente
   router.post('/reset-connections', async (req, res) => {
     try {
       const io = req.app.get('io');
       if (!io) {
         return res.status(500).json({ error: 'Socket.IO not available' });
       }

       const result = await webSocketService.resetConnections(io);
       res.json({ 
         success: true, 
         message: 'Conexiones WebSocket reiniciadas correctamente',
         result 
       });
     } catch (error) {
       console.error('Error resetting WebSocket connections:', error);
       res.status(500).json({ error: 'Error reiniciando conexiones WebSocket' });
     }
   });

   router.get('/rounds/:bookmakerId', async (req, res) => {
     const { bookmakerId } = req.params;
     const limit = parseInt(req.query.limit) || 1000;
     try {
       const result = await db.query(
         'SELECT id, bookmaker_id, round_id, bets_count, total_bet_amount, online_players, max_multiplier, total_cashout, casino_profit, loss_percentage, timestamp, created_at FROM game_rounds WHERE bookmaker_id = $1 ORDER BY timestamp DESC LIMIT $2',
         [bookmakerId, limit]
       );
       console.log(`Rondas devueltas para bookmakerId ${bookmakerId}: ${result.rows.length}`);
       res.json(result.rows);
     } catch (error) {
       console.error('Error fetching rounds:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   router.post('/rounds', async (req, res) => {
     const { bookmaker_id, round_id, bets_count, total_bet_amount, online_players, max_multiplier, total_cashout, casino_profit, loss_percentage } = req.body;
     try {
       const result = await db.query(
         'INSERT INTO game_rounds (bookmaker_id, round_id, bets_count, total_bet_amount, online_players, max_multiplier, total_cashout, casino_profit, loss_percentage, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *',
         [bookmaker_id, round_id, bets_count || 0, total_bet_amount || 0, online_players || 0, max_multiplier || 0, total_cashout || 0, casino_profit || 0, loss_percentage || 0]
       );
       const newRound = result.rows[0];
       console.log('Nueva ronda guardada:', newRound);

       const roundsResult = await db.query(
         'SELECT * FROM game_rounds WHERE bookmaker_id = $1 ORDER BY timestamp DESC LIMIT 1000',
         [bookmaker_id]
       );
       const rounds = roundsResult.rows;

      res.status(201).json(newRound);
     } catch (error) {
       console.error('Error saving round:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   // Obtener historial de un bookmaker específico
   router.get('/bookmakers/:id/history', async (req, res) => {
     const { id } = req.params;
     try {
       const history = await BookmakerHistoryModel.getBookmakerHistory(id);
       res.json(history);
     } catch (error) {
       console.error('Error fetching bookmaker history:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });

   // Obtener historial general
   router.get('/history', async (req, res) => {
     try {
       const history = await BookmakerHistoryModel.getAllHistory();
       res.json(history);
     } catch (error) {
       console.error('Error fetching history:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   });


// Endpoints para monitoreo de bookmakers
// Obtener estadísticas de monitoreo para dashboard
router.get('/monitoring/dashboard', async (req, res) => {
  try {
    const stats = await BookmakerMonitoring.getDashboardStatsWithLastRounds();
    const generalStats = await BookmakerMonitoring.getGeneralStats();
    
    res.json({
      success: true,
      data: {
        bookmakers: stats,
        general: generalStats
      }
    });
  } catch (error) {
    console.error('Error fetching monitoring dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener estadísticas generales de monitoreo
router.get('/monitoring/stats', async (req, res) => {
  try {
    const stats = await BookmakerMonitoring.getGeneralStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching monitoring stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener historial de conexiones de un bookmaker específico
router.get('/monitoring/:bookmakerId/history', async (req, res) => {
  try {
    const { bookmakerId } = req.params;
    const { limit = 10 } = req.query;
    
    const history = await BookmakerMonitoring.getRecentConnectionHistory(
      parseInt(bookmakerId), 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching bookmaker connection history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Actualizar estadísticas diarias manualmente
router.post('/monitoring/update-daily-stats', async (req, res) => {
  try {
    const { bookmakerId } = req.body;
    
    if (bookmakerId) {
      await BookmakerMonitoring.updateDailyStats(bookmakerId);
      res.json({
        success: true,
        message: 'Estadísticas diarias actualizadas para el bookmaker especificado'
      });
    } else {
      // Actualizar para todos los bookmakers activos
      const bookmakers = await db.query('SELECT id FROM bookmakers WHERE active = true');
      
      for (const bookmaker of bookmakers.rows) {
        await BookmakerMonitoring.updateDailyStats(bookmaker.id);
      }
      
      res.json({
        success: true,
        message: 'Estadísticas diarias actualizadas para todos los bookmakers'
      });
    }
  } catch (error) {
    console.error('Error updating daily stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener último resultado de un bookmaker específico (compatible con la ruta existente)
router.get('/rounds/:bookmakerId', async (req, res) => {
  const { bookmakerId } = req.params;
  const limit = parseInt(req.query.limit) || 1;
  
  try {
    const result = await db.query(
      'SELECT id, bookmaker_id, round_id, bets_count, total_bet_amount, online_players, max_multiplier, total_cashout, casino_profit, loss_percentage, timestamp, created_at FROM game_rounds WHERE bookmaker_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [bookmakerId, limit]
    );
    
    res.json({
      success: true,
      data: result.rows,
      bookmakerId: parseInt(bookmakerId),
      limit: limit
    });
  } catch (error) {
    console.error('Error fetching rounds for bookmaker:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener todos los bookmakers disponibles con sus últimos resultados
router.get('/monitoring/available-bookmakers', async (req, res) => {
  try {
    // Obtener todos los bookmakers activos
    const bookmakers = await db.query('SELECT id, name FROM bookmakers WHERE active = true ORDER BY id');
    
    // Para cada bookmaker, obtener el último resultado
    const bookmakersWithLastRounds = await Promise.all(
      bookmakers.rows.map(async (bookmaker) => {
        try {
          const lastRound = await BookmakerMonitoring.getLastRoundForBookmaker(bookmaker.id);
          return {
            id: bookmaker.id,
            name: bookmaker.name,
            last_round: lastRound,
            has_data: !!lastRound,
            api_url: `/api/aviator/rounds/${bookmaker.id}?limit=1`
          };
        } catch (error) {
          console.error(`Error fetching last round for bookmaker ${bookmaker.id}:`, error);
          return {
            id: bookmaker.id,
            name: bookmaker.name,
            last_round: null,
            has_data: false,
            api_url: `/api/aviator/rounds/${bookmaker.id}?limit=1`,
            error: error.message
          };
        }
      })
    );
    
    res.json({
      success: true,
      data: bookmakersWithLastRounds,
      total_bookmakers: bookmakers.rows.length,
      bookmakers_with_data: bookmakersWithLastRounds.filter(b => b.has_data).length
    });
  } catch (error) {
    console.error('Error fetching available bookmakers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener hora actual del servidor
router.get('/server-time', async (req, res) => {
  try {
    const serverTime = new Date();
    res.json({
      success: true,
      server_time: serverTime.toISOString(),
      timestamp: serverTime.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utc_offset: serverTime.getTimezoneOffset(),
      server_date: serverTime.toLocaleDateString('es-ES'),
      server_time_formatted: serverTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    });
  } catch (error) {
    console.error('Error getting server time:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener estado de monitoreo de resultados
router.get('/monitoring/result-status', async (req, res) => {
  try {
    const monitoringStatus = resultMonitoringService.getMonitoringStatus();
    
    res.json({
      success: true,
      data: monitoringStatus,
      total_bookmakers: monitoringStatus.length,
      stale_bookmakers: monitoringStatus.filter(b => b.has_stale_data).length
    });
  } catch (error) {
    console.error('Error getting result monitoring status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Obtener estado de monitoreo de un bookmaker específico
router.get('/monitoring/result-status/:bookmakerId', async (req, res) => {
  try {
    const { bookmakerId } = req.params;
    const bookmakerStatus = resultMonitoringService.getBookmakerStatus(parseInt(bookmakerId));
    
    if (!bookmakerStatus) {
      return res.status(404).json({
        success: false,
        message: 'Bookmaker no encontrado o sin datos de monitoreo'
      });
    }
    
    res.json({
      success: true,
      data: bookmakerStatus
    });
  } catch (error) {
    console.error('Error getting bookmaker monitoring status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});



module.exports = router;
const WebSocket = require('ws');
const db = require('../../config/database');
const { getBookmakersWithConfigs } = require('../../models/Aviator/bookmakerModel');
const { addRound, invalidateCache } = require('../../models/Aviator/gameRoundModel');
const BookmakerMonitoring = require('../../models/Aviator/bookmakerMonitoringModel');
const { decodeMessage } = require('./decoder');

class WebSocketService {
  constructor() {
    this.connections = new Map();
    this.roundData = new Map();
    this.pingIntervals = new Map();
    this.maxRetries = 3; // Reducido de 5 a 3
    this.retryDelay = 5000;
    this.io = null;
    this.isResetting = false;
  }

  async initializeConnections(io) {
    this.io = io;
    console.log('[WebSocketService] Inicializando conexiones');
    try {
      const bookmakers = await getBookmakersWithConfigs();
      for (const bookmaker of bookmakers) {
        if (this.isValidBookmaker(bookmaker)) {
          this.connectToBookmaker(bookmaker, io, 0);
        } else {
          console.warn(`[WebSocketService] Configuración inválida para bookmaker ${bookmaker.id}, omitiendo conexión`);
        }
      }

      io.on('connection', (socket) => {
        console.log(`[WebSocketService] Socket conectado: ${socket.id}`);
        socket.on('joinBookmaker', (bookmakerId) => {
          console.log(`[WebSocketService] Cliente unido a bookmaker:${bookmakerId}`);
          socket.join(`bookmaker:${bookmakerId}`);
          const roundData = this.roundData.get(bookmakerId);
          
          // Always send data, even if no active round
          const casinoProfit = roundData ? (roundData.totalBetAmount - roundData.totalCashout) : 0;
          socket.emit('round', {
            online_players: roundData?.onlinePlayers || 0,
            bets_count: roundData?.betsCount || 0,
            total_bet_amount: roundData?.totalBetAmount || 0,
            total_cashout: roundData?.totalCashout || 0,
            current_multiplier: roundData?.currentMultiplier || 0,
            max_multiplier: roundData?.maxMultiplier || 0,
            game_state: roundData?.gameState || 'Bet',
            casino_profit: Number(casinoProfit.toFixed(2)),
            round_id: roundData?.roundId || null,
          });
        });
      });

      setInterval(async () => {
        if (this.isResetting) return; // Evitar actualizaciones durante el reseteo
        try {
          const updatedBookmakers = await getBookmakersWithConfigs();
          updatedBookmakers.forEach((bookmaker) => {
            if (
              this.isValidBookmaker(bookmaker) &&
              !this.connections.has(bookmaker.id)
            ) {
              this.connectToBookmaker(bookmaker, io, 0);
            } else if (
              (!this.isValidBookmaker(bookmaker) && this.connections.has(bookmaker.id))
            ) {
              const connection = this.connections.get(bookmaker.id);
              if (connection.ws) {
                connection.ws.close();
                console.log(`Closed WebSocket for bookmaker ${bookmaker.id} due to invalid config`);
              }
              clearInterval(this.pingIntervals.get(bookmaker.id));
              this.connections.delete(bookmaker.id);
              this.pingIntervals.delete(bookmaker.id);
              this.roundData.delete(bookmaker.id);
            }
          });
        } catch (error) {
          console.error('Error checking bookmakers for WebSocket updates:', error.message);
        }
      }, 60000);
    } catch (error) {
      console.error('Error initializing WebSocket connections:', error.message);
    }
  }

  isValidBookmaker(bookmaker) {
    const { url_websocket, first_message, second_message, third_message } = bookmaker;
    const isValidBase64 = (str) => str && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
    return (
      url_websocket &&
      url_websocket.startsWith('wss://') &&
      first_message &&
      isValidBase64(first_message) &&
      second_message &&
      isValidBase64(second_message) &&
      third_message &&
      isValidBase64(third_message)
    );
  }

  connectToBookmaker(bookmaker, io, retryCount) {
    const { id, nombre: name, url_websocket, first_message, second_message, third_message } = bookmaker;
    const headers = {
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Origin: 'https://aviator-next.spribegaming.com',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'es-419,es;q=0.9',
      'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
    };

    try {
      // Validar configuración del bookmaker
      if (!this.isValidBookmaker(bookmaker)) {
        throw new Error(`Invalid configuration for bookmaker ${id}`);
      }

      // Limpiar conexión existente
      if (this.connections.has(id)) {
        const connection = this.connections.get(id);
        if (connection.ws) {
          connection.ws.close(1000, 'Closing for reset');
          console.log(`Closed existing WebSocket for bookmaker ${id}`);
        }
        clearInterval(this.pingIntervals.get(id));
        this.connections.delete(id);
        this.pingIntervals.delete(id);
        this.roundData.delete(id);
      }

      const ws = new WebSocket(url_websocket, [], { headers });

      this.connections.set(id, { ws, status: 'CONNECTING', lastPing: null });
      this.roundData.set(id, {
        betsCount: 0,
        totalBetAmount: 0,
        onlinePlayers: 0,
        roundId: null,
        maxMultiplier: 0,
        currentMultiplier: 0,
        totalCashout: 0,
        cashoutRecords: new Set(),
        gameState: 'Bet',
      });

      ws.on('open', async () => {
        console.log(`WebSocket connected for bookmaker ${id}`);
        this.connections.set(id, { ws, status: 'CONNECTED', lastPing: new Date() });
        
        // Actualizar estado de conexión en monitoreo
        try {
          await BookmakerMonitoring.updateConnectionStatus(id, 'CONNECTED');
        } catch (error) {
          console.error(`Error updating connection status for bookmaker ${id}:`, error);
        }
        
        ws.send(Buffer.from(first_message, 'base64'));
      });

      ws.on('message', async (data) => {
        try {
          const decodedMessage = decodeMessage(data);
          if (!decodedMessage) return;

          this.connections.set(id, { ws, status: 'CONNECTED', lastPing: new Date() });

          if (!ws.firstResponseReceived) {
            ws.send(Buffer.from(second_message, 'base64'));
            ws.firstResponseReceived = true;
          }

          const roundData = this.roundData.get(id);
          if (!roundData) return;

          if (decodedMessage.p) {
            const { p, c } = decodedMessage.p;

            if (c === 'updateCurrentBets') {
              roundData.betsCount = Math.max(roundData.betsCount, p.betsCount || 0);
              roundData.totalBetAmount = p.bets?.reduce((sum, bet) => sum + (bet.bet || 0), 0) || 0;
              roundData.gameState = 'Bet';
            } else if (c === 'onlinePlayers') {
              roundData.onlinePlayers = p.onlinePlayers || 0;
            } else if (c === 'changeState') {
              if (p.newStateId === 1) {
                roundData.gameState = 'Bet';
                roundData.roundId = p.roundId || roundData.roundId;
                roundData.currentMultiplier = 0;
                if (p.roundId) {
                  this.io.to(`bookmaker:${id}`).emit('roundStart', {
                    roundId: p.roundId,
                    gameState: 'Bet',
                  });
                }
              } else if (p.newStateId === 2) {
                roundData.gameState = 'Run';
                roundData.roundId = p.roundId || roundData.roundId;
                roundData.currentMultiplier = 0;
              }
            } else if (c === 'updateCurrentCashOuts') {
              p.cashouts?.forEach((cashout) => {
                const cashoutKey = `${cashout.player_id || ''}-${cashout.betId || ''}-${cashout.multiplier || 0}`;
                if (!roundData.cashoutRecords.has(cashoutKey)) {
                  roundData.totalCashout += cashout.winAmount || 0;
                  roundData.cashoutRecords.add(cashoutKey);
                }
              });
            } else if (c === 'x') {
              if (p.crashX !== undefined) {
                roundData.maxMultiplier = p.crashX || 0;
                roundData.currentMultiplier = p.crashX || 0;
                roundData.gameState = 'End';
                if (roundData.roundId) {
                  await this.saveRoundData(id, name, p.crashX);
                  setTimeout(() => this.resetRoundData(id), 4000);
                }
              } else {
                roundData.currentMultiplier = p.x || 0;
                roundData.gameState = 'Run';
                this.io.to(`bookmaker:${id}`).emit('multiplier', {
                  bookmakerId: id,
                  current_multiplier: roundData.currentMultiplier.toFixed(2),
                });
              }
            } else if (c === 'roundChartInfo') {
              if (p.roundId) {
                roundData.roundId = p.roundId;
                roundData.maxMultiplier = p.maxMultiplier || 0;
                roundData.currentMultiplier = p.maxMultiplier || 0;
                this.io.to(`bookmaker:${id}`).emit('roundChartInfo', {
                  maxMultiplier: p.maxMultiplier,
                  roundId: p.roundId,
                });
              }
            }

            const casinoProfit = roundData.totalBetAmount - roundData.totalCashout;
            this.io.to(`bookmaker:${id}`).emit('round', {
              online_players: roundData.onlinePlayers,
              bets_count: roundData.betsCount,
              total_bet_amount: roundData.totalBetAmount,
              total_cashout: roundData.totalCashout,
              current_multiplier: roundData.currentMultiplier,
              max_multiplier: roundData.maxMultiplier,
              game_state: roundData.gameState,
              casino_profit: Number(casinoProfit.toFixed(2)),
              round_id: roundData.roundId,
            });
          }
        } catch (error) {
          console.error(`Error processing message for bookmaker ${id}:`, error.message);
        }
      });

      ws.on('error', async (error) => {
        console.error(`WebSocket error for bookmaker ${id}: ${error.message}`);
        this.connections.set(id, { ws, status: 'DISCONNECTED', lastPing: this.connections.get(id)?.lastPing });
        
        // Actualizar estado de desconexión en monitoreo
        try {
          await BookmakerMonitoring.updateConnectionStatus(id, 'DISCONNECTED');
        } catch (monitoringError) {
          console.error(`Error updating disconnection status for bookmaker ${id}:`, monitoringError);
        }
        
        if (!this.isResetting) {
          this.handleReconnect(bookmaker, io, retryCount);
        }
      });

      ws.on('close', async (code, reason) => {
        console.log(`WebSocket closed for bookmaker ${id} (code: ${code}, reason: ${reason || 'No reason provided'})`);
        this.connections.set(id, { ws, status: 'DISCONNECTED', lastPing: this.connections.get(id)?.lastPing });
        
        // Actualizar estado de desconexión en monitoreo
        try {
          await BookmakerMonitoring.updateConnectionStatus(id, 'DISCONNECTED');
        } catch (monitoringError) {
          console.error(`Error updating disconnection status for bookmaker ${id}:`, monitoringError);
        }
        
        const roundData = this.roundData.get(id);
        if (roundData?.roundId && roundData.maxMultiplier > 0) {
          await this.saveRoundData(id, name, roundData.maxMultiplier);
        }
        if (!this.isResetting) {
          this.handleReconnect(bookmaker, io, retryCount);
        }
      });

      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(Buffer.from(third_message, 'base64'));
          } catch (error) {
            console.error(`Error sending PING for bookmaker ${id}: ${error.message}`);
            if (!this.isResetting) {
              this.handleReconnect(bookmaker, io, retryCount);
            }
          }
        } else {
          console.log(`WebSocket not OPEN for bookmaker ${id}, state: ${ws.readyState}`);
          if (!this.isResetting) {
            this.handleReconnect(bookmaker, io, retryCount);
          }
        }
      }, 10000);

      this.pingIntervals.set(id, pingInterval);

      ws.on('close', () => {
        console.log(`Cleaning up pingInterval for bookmaker ${id}`);
        clearInterval(this.pingIntervals.get(id));
        this.pingIntervals.delete(id);
      });
    } catch (error) {
      console.error(`Failed to connect WebSocket for bookmaker ${id}: ${error.message}`);
      this.connections.set(id, { ws: null, status: 'DISCONNECTED', lastPing: null });
      if (!this.isResetting) {
        this.handleReconnect(bookmaker, io, retryCount);
      }
    }
  }

  handleReconnect(bookmaker, io, retryCount) {
    if (retryCount >= this.maxRetries) {
      console.log(`ACTUALIZA TU TOKEN para bookmaker ${bookmaker.id}. Máximo de intentos (${this.maxRetries}) alcanzado.`);
      // No eliminamos conexiones ni datos para mantener el servidor activo
      return;
    }

    console.log(`Attempting to reconnect for bookmaker ${bookmaker.id} (Attempt ${retryCount + 1}/${this.maxRetries})`);
    setTimeout(() => {
      this.connectToBookmaker(bookmaker, io, retryCount + 1);
    }, this.retryDelay * (retryCount + 1));
  }

  async saveRoundData(bookmaker_id, bookmaker_name, crashX) {
    const roundData = this.roundData.get(bookmaker_id);
    if (!roundData.roundId) {
      console.error(`Cannot save round for bookmaker ${bookmaker_id}: round_id is NULL`);
      return;
    }
    const casinoProfit = roundData.totalBetAmount - roundData.totalCashout;
    const lossPercentage = roundData.totalBetAmount > 0 ? (casinoProfit / roundData.totalBetAmount) * 100 : 0;


    try {
      await addRound(
        bookmaker_id,
        roundData.roundId,
        roundData.betsCount,
        Number(roundData.totalBetAmount.toFixed(2)),
        roundData.onlinePlayers,
        Number(crashX.toFixed(2)),
        Number(roundData.totalCashout.toFixed(2)),
        Number(casinoProfit.toFixed(2)),
        Number(lossPercentage.toFixed(2))
      );

      // Actualizar información de última ronda en monitoreo
      try {
        await BookmakerMonitoring.updateLastRound(bookmaker_id, roundData.roundId, crashX);
        await BookmakerMonitoring.updateDailyStats(bookmaker_id);
      } catch (monitoringError) {
        console.error(`Error updating round info for bookmaker ${bookmaker_id}:`, monitoringError);
      }

      const now = new Date();
      const offset = -5 * 60;
      now.setMinutes(now.getMinutes() + offset);
      const createdAt = now.toISOString();

      const newRoundData = {
        id: roundData.roundId,
        bookmaker_id,
        round_id: String(roundData.roundId),
        timestamp: createdAt,
        bets_count: roundData.betsCount,
        total_bet_amount: Number(roundData.totalBetAmount.toFixed(2)),
        online_players: roundData.onlinePlayers,
        max_multiplier: Number(crashX.toFixed(2)),
        total_cashout: Number(roundData.totalCashout.toFixed(2)),
        casino_profit: Number(casinoProfit.toFixed(2)),
        loss_percentage: Number(lossPercentage.toFixed(2)),
        created_at: createdAt,
      };

      const roundsResult = await db.query(
        'SELECT * FROM game_rounds WHERE bookmaker_id = $1 ORDER BY timestamp DESC LIMIT 1000',
        [bookmaker_id]
      );
      const rounds = roundsResult.rows;

      invalidateCache(bookmaker_id);

      console.log(`[SAVE] ROUND_ID: ${roundData.roundId}\nBOOKMAKER: ${bookmaker_name}\nEMIT_FRONTEND: TRUE\n---------------------------`);
      this.io.to(`bookmaker:${bookmaker_id}`).emit('newRound', newRoundData);
    } catch (error) {
      console.error(`Error saving round for bookmaker ${bookmaker_id}:`, error.message);
    }
  }

  resetRoundData(bookmaker_id) {
    console.log(`Resetting roundData for bookmaker ${bookmaker_id}, preserving onlinePlayers`);
    const currentRoundData = this.roundData.get(bookmaker_id);
    this.roundData.set(bookmaker_id, {
      betsCount: 0,
      totalBetAmount: 0,
      onlinePlayers: currentRoundData ? currentRoundData.onlinePlayers : 0,
      roundId: null,
      maxMultiplier: 0,
      currentMultiplier: 0,
      totalCashout: 0,
      cashoutRecords: new Set(),
      gameState: 'Bet',
    });
  }

  async resetConnections(io) {
    console.log('[WebSocketService] Reseteando todas las conexiones WebSocket');
    try {
      this.isResetting = true;

      // Cerrar todas las conexiones existentes
      for (const [bookmakerId, connection] of this.connections) {
        if (connection.ws && connection.ws.readyState !== WebSocket.CLOSED) {
          connection.ws.close(1000, 'Closing for reset');
          console.log(`Closed WebSocket for bookmaker ${bookmakerId}`);
        }
        clearInterval(this.pingIntervals.get(bookmakerId));
        this.pingIntervals.delete(bookmakerId);
      }
      this.connections.clear();
      this.roundData.clear();

      // Esperar un momento para asegurar que todas las conexiones estén cerradas
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reiniciar conexiones
      await this.initializeConnections(io);
      console.log('[WebSocketService] Conexiones WebSocket reseteadas correctamente');
      this.isResetting = false;
      return { message: 'Conexiones WebSocket reseteadas correctamente' };
    } catch (error) {
      console.error(`Error al resetear conexiones WebSocket: ${error.message}`);
      this.isResetting = false;
      throw new Error(`Error al resetear conexiones WebSocket: ${error.message}`);
    }
  }

  getConnectionStatus() {
    return Array.from(this.connections.entries()).map(([bookmakerId, connection]) => ({
      bookmakerId,
      status: connection.status,
      lastPing: connection.lastPing,
    }));
  }
}

module.exports = new WebSocketService();
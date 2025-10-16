-- Script completo para crear todas las tablas necesarias


-- Crear tabla bookmakers
CREATE TABLE IF NOT EXISTS bookmakers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url_image VARCHAR(500),
    recomendado BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    url_websocket VARCHAR(500),
    first_message TEXT,
    second_message TEXT,
    third_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla game_rounds
CREATE TABLE IF NOT EXISTS game_rounds (
    id SERIAL PRIMARY KEY,
    bookmaker_id INTEGER NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
    round_id VARCHAR(255) NOT NULL,
    bets_count INTEGER DEFAULT 0,
    total_bet_amount DECIMAL(15,2) DEFAULT 0,
    online_players INTEGER DEFAULT 0,
    max_multiplier DECIMAL(10,2) DEFAULT 0,
    total_cashout DECIMAL(15,2) DEFAULT 0,
    casino_profit DECIMAL(15,2) DEFAULT 0,
    loss_percentage DECIMAL(5,2) DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de historial de modificaciones de bookmakers
CREATE TABLE IF NOT EXISTS bookmaker_history (
    id SERIAL PRIMARY KEY,
    bookmaker_id INTEGER NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted'
    field_name VARCHAR(100), -- nombre del campo modificado
    old_value TEXT, -- valor anterior
    new_value TEXT, -- valor nuevo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Crear tabla para monitoreo de bookmakers
CREATE TABLE IF NOT EXISTS bookmaker_monitoring (
    id SERIAL PRIMARY KEY,
    bookmaker_id INTEGER NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
    connection_status VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED', -- CONNECTED, DISCONNECTED, CONNECTING
    last_connection_time TIMESTAMP WITH TIME ZONE,
    last_disconnection_time TIMESTAMP WITH TIME ZONE,
    last_round_id VARCHAR(50),
    last_max_multiplier DECIMAL(10,2),
    last_round_time TIMESTAMP WITH TIME ZONE,
    total_rounds_today INTEGER DEFAULT 0,
    average_multiplier DECIMAL(10,2),
    uptime_percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_game_rounds_bookmaker_id ON game_rounds(bookmaker_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_timestamp ON game_rounds(timestamp);
CREATE INDEX IF NOT EXISTS idx_game_rounds_round_id ON game_rounds(round_id);
CREATE INDEX IF NOT EXISTS idx_bookmaker_history_bookmaker_id ON bookmaker_history(bookmaker_id);
CREATE INDEX IF NOT EXISTS idx_bookmaker_history_created_at ON bookmaker_history(created_at);
CREATE INDEX IF NOT EXISTS idx_bookmaker_monitoring_bookmaker_id ON bookmaker_monitoring(bookmaker_id);
CREATE INDEX IF NOT EXISTS idx_bookmaker_monitoring_status ON bookmaker_monitoring(connection_status);
CREATE INDEX IF NOT EXISTS idx_bookmaker_monitoring_last_round_time ON bookmaker_monitoring(last_round_time);

-- Insertar algunos bookmakers de ejemplo
INSERT INTO bookmakers (name, description, url_image, recomendado, active, url_websocket, first_message, second_message, third_message) VALUES
('1win', '1win Casino', '/assets/bookmakers/1win.jpg', true, true, 'wss://eu-central-1-game9.spribegaming.com/BlueBox/websocket', 'gAAyEgADAAFjAgAAAWEDAAAAAXASAAIAA2FwaQgABTEuOC40AAJjbAgACkphdmFTY3JpcHQ=', 'gALMEgADAAFjAgAAAWEDAAEAAXASAAQAAnpuCAASYXZpYXRvcl9jb3JlX2luc3Q3AAJ1bggAETc1MzA5ODEwNyYmMXhzbG90AAJwdwgAAAABcBIABgAFdG9rZW4IACQxY2Q4NjI1OS0yYzJjLTQwM2EtODMwNi0zZDdiNzQ4YjFkMTkACGN1cnJlbmN5CAADQ09QAARsYW5nCAACZXMADHNlc3Npb25Ub2tlbggAQDFva2dCbktLSFpjQXhuRUdlNVh5VXZqTzRFcmlLVFZYYTBzNFZMb1ZReUZaN0U5bThlcWExY1A2TEZPbEhRUHYACHBsYXRmb3JtEgADAApkZXZpY2VJbmZvCAEdeyJ1c2VyQWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTQwLjAuMC4wIFNhZmFyaS81MzcuMzYiLCJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiVW5rbm93biIsIm9zX3ZlcnNpb24iOiJ3aW5kb3dzLTEwIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTQwLjAuMC4wIiwiZGV2aWNlVHlwZSI6ImRlc2t0b3AiLCJvcmllbnRhdGlvbiI6ImxhbmRzY2FwZSJ9AAl1c2VyQWdlbnQIAHEiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0MC4wLjAuMCBTYWZhcmkvNTM3LjM2IgAKZGV2aWNlVHlwZQgAB2Rlc2t0b3AAB3ZlcnNpb24IAAY0LjIuODg=', 'gAA0EgADAAFjAgEAAWEDAA0AAXASAAMAAWMIAAxQSU5HX1JFUVVFU1QAAXIE/////wABcBIAAA=='),
('Bet365', 'Bet365 Casino', '/assets/bookmakers/bet365.jpg', true, true, 'wss://example.com/ws', 'first_message_base64', 'second_message_base64', 'third_message_base64'),
('Betway', 'Betway Casino', '/assets/bookmakers/betway.jpg', false, true, 'wss://example.com/ws', 'first_message_base64', 'second_message_base64', 'third_message_base64')
ON CONFLICT DO NOTHING;

-- Insertar registros de monitoreo para bookmakers existentes
INSERT INTO bookmaker_monitoring (bookmaker_id, connection_status, last_connection_time)
SELECT id, 'DISCONNECTED', CURRENT_TIMESTAMP
FROM bookmakers
WHERE id NOT IN (SELECT bookmaker_id FROM bookmaker_monitoring);

-- Función para actualizar el timestamp de updated_at en bookmaker_monitoring
CREATE OR REPLACE FUNCTION update_bookmaker_monitoring_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente en bookmaker_monitoring
DROP TRIGGER IF EXISTS trigger_update_bookmaker_monitoring_updated_at ON bookmaker_monitoring;
CREATE TRIGGER trigger_update_bookmaker_monitoring_updated_at
    BEFORE UPDATE ON bookmaker_monitoring
    FOR EACH ROW
    EXECUTE FUNCTION update_bookmaker_monitoring_updated_at();


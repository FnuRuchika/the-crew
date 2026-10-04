-- Completed operations are history: convert event chunks to Hypercore columnstore after 7 days.
-- Segmenting by operation_id keeps "replay one operation's ledger" fast on compressed data.
ALTER TABLE crew.risk_events  SET (timescaledb.enable_columnstore = true, timescaledb.segmentby = 'operation_id', timescaledb.orderby = 'occurred_at DESC, seq DESC');
ALTER TABLE crew.agent_events SET (timescaledb.enable_columnstore = true, timescaledb.segmentby = 'operation_id', timescaledb.orderby = 'occurred_at DESC, seq DESC');
ALTER TABLE crew.milestones   SET (timescaledb.enable_columnstore = true, timescaledb.segmentby = 'operation_id', timescaledb.orderby = 'occurred_at DESC, seq DESC');

CALL add_columnstore_policy('crew.risk_events',  after => INTERVAL '7 days', if_not_exists => true);
CALL add_columnstore_policy('crew.agent_events', after => INTERVAL '7 days', if_not_exists => true);
CALL add_columnstore_policy('crew.milestones',   after => INTERVAL '7 days', if_not_exists => true);

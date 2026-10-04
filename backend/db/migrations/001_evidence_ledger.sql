-- THE CREW · Operational Evidence Ledger (Tiger Data / TimescaleDB)
--
-- Relational tables hold *entities* (operations, de-duplicated signals, interventions).
-- Hypertables hold append-only, time-ordered *event streams* (risk, agents, milestones):
-- they are partitioned by time, read per operation in time order, and compressed to
-- columnstore once an operation is history.
--
-- Privacy: no audio, no full transcripts, no keys. Only the short evidence phrases and
-- explanations needed to justify a safety decision are stored.

CREATE SCHEMA IF NOT EXISTS crew;

CREATE TABLE IF NOT EXISTS crew.operations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode             text        NOT NULL CHECK (mode IN ('case_file', 'typed', 'live_call')),
    scenario         text        CHECK (char_length(scenario) <= 80),
    started_at       timestamptz NOT NULL DEFAULT now(),
    ended_at         timestamptz,
    final_status     text        NOT NULL DEFAULT 'active'
                     CHECK (final_status IN ('active', 'protected', 'safe_exit', 'assessed', 'abandoned')),
    peak_risk        smallint    NOT NULL DEFAULT 0 CHECK (peak_risk BETWEEN 0 AND 100),
    amount_protected numeric(12, 2) CHECK (amount_protected >= 0),
    threat_type      text        CHECK (char_length(threat_type) <= 120),
    outcome          text        CHECK (char_length(outcome) <= 200),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS operations_started_idx ON crew.operations (started_at DESC);
CREATE INDEX IF NOT EXISTS operations_mode_started_idx ON crew.operations (mode, started_at DESC);

-- One row per distinct piece of evidence. Re-analysis of the same conversation upserts
-- into the same row (UNIQUE below), so duplicates are impossible at the database level.
CREATE TABLE IF NOT EXISTS crew.signals (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id  uuid        NOT NULL REFERENCES crew.operations (id) ON DELETE CASCADE,
    first_seen_at timestamptz NOT NULL,
    last_seen_at  timestamptz NOT NULL,
    seq           integer     NOT NULL,
    signal_type   text        NOT NULL CHECK (signal_type ~ '^[a-z][a-z_-]{1,39}$'),
    evidence_key  text        NOT NULL CHECK (char_length(evidence_key) <= 300),
    label         text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
    confidence    real        CHECK (confidence BETWEEN 0 AND 1),
    severity      text        CHECK (severity IN ('low', 'medium', 'high')),
    evidence      text        CHECK (char_length(evidence) <= 300),
    explanation   text        CHECK (char_length(explanation) <= 500),
    detected_by   text        NOT NULL CHECK (detected_by IN ('mastermind', 'grifter', 'lookout', 'insideMan', 'safecracker', 'fixer', 'getaway')),
    source        text        NOT NULL CHECK (source IN ('scripted_rules', 'payment_rules', 'identity_rules', 'gemini')),
    times_seen    integer     NOT NULL DEFAULT 1 CHECK (times_seen >= 1),
    UNIQUE (operation_id, signal_type, evidence_key),
    CHECK (last_seen_at >= first_seen_at)
);
CREATE INDEX IF NOT EXISTS signals_operation_time_idx ON crew.signals (operation_id, first_seen_at);

CREATE TABLE IF NOT EXISTS crew.interventions (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id    uuid        NOT NULL REFERENCES crew.operations (id) ON DELETE CASCADE,
    occurred_at     timestamptz NOT NULL,
    seq             integer     NOT NULL,
    trigger_score   smallint    NOT NULL CHECK (trigger_score BETWEEN 0 AND 100),
    reasons         text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(reasons) <= 12),
    action_selected text        CHECK (action_selected IN ('call-trusted-contact', 'verify-claimed-person', 'wait', 'exit')),
    action_at       timestamptz,
    outcome         text        CHECK (char_length(outcome) <= 200),
    outcome_at      timestamptz,
    UNIQUE (operation_id, seq)
);
CREATE INDEX IF NOT EXISTS interventions_operation_time_idx ON crew.interventions (operation_id, occurred_at);

-- ─────────── Time-series event streams (hypertables) ───────────

CREATE TABLE IF NOT EXISTS crew.risk_events (
    operation_id uuid        NOT NULL REFERENCES crew.operations (id) ON DELETE CASCADE,
    occurred_at  timestamptz NOT NULL,
    seq          integer     NOT NULL,
    score        smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
    level        text        NOT NULL CHECK (level IN ('low', 'elevated', 'high', 'critical')),
    reason       text        CHECK (char_length(reason) <= 200),
    PRIMARY KEY (operation_id, seq, occurred_at)
);

CREATE TABLE IF NOT EXISTS crew.agent_events (
    operation_id uuid        NOT NULL REFERENCES crew.operations (id) ON DELETE CASCADE,
    occurred_at  timestamptz NOT NULL,
    seq          integer     NOT NULL,
    agent        text        NOT NULL CHECK (agent IN ('mastermind', 'grifter', 'lookout', 'insideMan', 'safecracker', 'fixer', 'getaway')),
    action       text        NOT NULL CHECK (action IN ('active', 'monitoring', 'standby', 'complete')),
    reason       text        CHECK (char_length(reason) <= 240),
    PRIMARY KEY (operation_id, seq, occurred_at)
);

CREATE TABLE IF NOT EXISTS crew.milestones (
    operation_id uuid        NOT NULL REFERENCES crew.operations (id) ON DELETE CASCADE,
    occurred_at  timestamptz NOT NULL,
    seq          integer     NOT NULL,
    kind         text        NOT NULL CHECK (kind IN ('operation_started', 'segment_analyzed', 'payment_initiated', 'verification', 'action_selected', 'outcome', 'note')),
    agent        text        CHECK (agent IN ('mastermind', 'grifter', 'lookout', 'insideMan', 'safecracker', 'fixer', 'getaway')),
    title        text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    detail       text        CHECK (char_length(detail) <= 300),
    PRIMARY KEY (operation_id, seq, occurred_at)
);

-- Operations last minutes; 7-day chunks keep the chunk count small for this workload.
SELECT create_hypertable('crew.risk_events',  by_range('occurred_at', INTERVAL '7 days'), if_not_exists => true);
SELECT create_hypertable('crew.agent_events', by_range('occurred_at', INTERVAL '7 days'), if_not_exists => true);
SELECT create_hypertable('crew.milestones',   by_range('occurred_at', INTERVAL '7 days'), if_not_exists => true);

CREATE INDEX IF NOT EXISTS risk_events_operation_time_idx  ON crew.risk_events  (operation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_operation_time_idx ON crew.agent_events (operation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS milestones_operation_time_idx   ON crew.milestones   (operation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS crew.schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

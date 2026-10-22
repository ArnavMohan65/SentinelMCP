-- Sentinel Compliance Database Schema
-- Defines relational tables for compliance entity cases, immutable audit logs, and test evaluation runs.

-- 1. Core entity records and current onboarding/compliance status
CREATE TABLE IF NOT EXISTS compliance_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name VARCHAR(255),
    country_code VARCHAR(2),
    jurisdiction VARCHAR(100),
    status VARCHAR(50) DEFAULT 'PENDING',
    risk_score NUMERIC(5,2) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Immutable audit trail logging tool/API invocations, arguments, and execution latency
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES compliance_cases(id) ON DELETE CASCADE,
    tool_name VARCHAR(100),
    tool_args JSONB,
    tool_output JSONB,
    execution_time_ms INT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Evaluation harness run history storing test run results, model/engine name, and latency
CREATE TABLE IF NOT EXISTS harness_eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES compliance_cases(id),
    model_name VARCHAR(100),
    passed BOOLEAN,
    failure_reason TEXT,
    tokens_used INT,
    latency_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


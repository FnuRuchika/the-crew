/** Mirrors backend/models/analysis.py. Keep the two in sync. */

export type LiveSignalType =
  | 'artificial_urgency'
  | 'emotional_leverage'
  | 'authority_impersonation'
  | 'isolation_secrecy'
  | 'unusual_payment_request'
  | 'credential_request'
  | 'remote_access_request'
  | 'suspicious_link'
  | 'family_emergency'
  | 'romance_manipulation'
  | 'prize_investment_claim'
  | 'other_manipulation';

export interface LiveSignal {
  type: LiveSignalType;
  label: string;
  confidence: number;
  evidence: string;
  explanation: string;
  evidence_verbatim: boolean;
  evidence_start: number | null;
  evidence_end: number | null;
}

export interface LiveAnalysis {
  is_suspicious: boolean;
  signals: LiveSignal[];
  claimed_identity: string | null;
  requested_action: string | null;
  summary: string;
}

export interface AnalyzeResponse {
  source: 'gemini';
  model: string;
  latency_ms: number;
  analysis: LiveAnalysis;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface HealthResponse {
  status: 'ok';
  gemini_configured: boolean;
  model: string;
  max_input_chars: number;
}

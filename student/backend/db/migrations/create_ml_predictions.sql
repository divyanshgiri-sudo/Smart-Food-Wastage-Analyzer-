-- Migration: Create isolated ml_predictions table
-- Stores prediction snapshots, metadata, and post-meal actual attendance
-- Does NOT modify existing meal sessions, intents, or attendance tables.

CREATE TABLE IF NOT EXISTS ml_predictions (
  prediction_id        TEXT PRIMARY KEY,
  prediction_date      TEXT NOT NULL,
  meal_type            TEXT NOT NULL,
  predicted_attendance INTEGER,
  actual_attendance    INTEGER DEFAULT NULL,
  lower_bound          INTEGER,
  upper_bound          INTEGER,
  status               TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recorded')),
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recorded_at          TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_date_meal 
  ON ml_predictions (prediction_date, meal_type);

-- CCS Remote - Initial Database Schema
-- This migration file is for future database needs
-- Currently, CCS Remote uses file-based storage for configuration and state

-- Version: 001
-- Created: 2026-01-14

-- Reserved for future use:
-- - Usage statistics persistence
-- - Account rotation history
-- - Token refresh logs
-- - Rate limit tracking

-- Example schema (not yet implemented):
--
-- CREATE TABLE IF NOT EXISTS usage_stats (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     provider VARCHAR(50) NOT NULL,
--     account_email VARCHAR(255),
--     timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
--     input_tokens INTEGER DEFAULT 0,
--     output_tokens INTEGER DEFAULT 0,
--     request_count INTEGER DEFAULT 0,
--     success_count INTEGER DEFAULT 0,
--     failure_count INTEGER DEFAULT 0
-- );
--
-- CREATE TABLE IF NOT EXISTS account_rotation_log (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     provider VARCHAR(50) NOT NULL,
--     from_account VARCHAR(255),
--     to_account VARCHAR(255),
--     reason VARCHAR(50),
--     timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
-- );
--
-- CREATE TABLE IF NOT EXISTS token_refresh_log (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     provider VARCHAR(50) NOT NULL,
--     account_email VARCHAR(255) NOT NULL,
--     success BOOLEAN NOT NULL,
--     error_message TEXT,
--     timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- Placeholder to ensure migration runs successfully
SELECT 1;


-- Migration: 002_expiring_tokens.sql
-- Description: Add columns for expiring offline tokens and rotation in shop_credentials

alter table if exists shop_credentials
  add column if not exists refresh_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists refresh_expires_at timestamptz;

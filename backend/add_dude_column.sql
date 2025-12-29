-- Migration: Add dude column to oficinas table
-- Run this before inserting the office data

ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS dude VARCHAR(50);

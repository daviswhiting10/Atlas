-- Additive: a session imported from a coach's spreadsheet as history.
-- Adding an enum value changes no existing row.
ALTER TYPE "SessionSource" ADD VALUE IF NOT EXISTS 'IMPORT';

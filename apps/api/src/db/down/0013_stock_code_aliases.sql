-- Destructive rollback: only on an isolated rehearsal database, never implicitly on production.
DROP TABLE IF EXISTS stock_code_aliases;

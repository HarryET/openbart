INSERT INTO providers (id, name)
VALUES ('bart', 'Bay Area Rapid Transit (BART)')
ON CONFLICT(id) DO NOTHING;

-- BART Routes
INSERT INTO routes (provider_id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color, route_url) VALUES
('bart', '1', 'Yellow-S', 'Antioch to SF Int''l Airport SFO/Millbrae', '1', 'FFFF33', '000000', 'https://www.bart.gov/schedules/bylineresults?route=1'),
('bart', '2', 'Yellow-N', 'Millbrae/SF Int''l SFO to Antioch', '1', 'FFFF33', '000000', 'https://www.bart.gov/schedules/bylineresults?route=2'),
('bart', '3', 'Orange-N', 'Berryessa/North San Jose to Richmond', '1', 'FF9933', '000000', 'https://www.bart.gov/schedules/bylineresults?route=3'),
('bart', '4', 'Orange-S', 'Richmond to Berryessa/North San Jose', '1', 'FF9933', '000000', 'https://www.bart.gov/schedules/bylineresults?route=4'),
('bart', '5', 'Green-S', 'Berryessa/North San Jose to Daly City', '1', '339933', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=5'),
('bart', '6', 'Green-N', 'Daly City to Berryessa/North San Jose', '1', '339933', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=6'),
('bart', '7', 'Red-S', 'Richmond to SF Int''l Airport SFO/Millbrae', '1', 'FF0000', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=7'),
('bart', '8', 'Red-N', 'Millbrae/SF Int''l Airport SFO to Richmond', '1', 'FF0000', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=8'),
('bart', '11', 'Blue-S', 'Dublin/Pleasanton to Daly City', '1', '0099CC', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=11'),
('bart', '12', 'Blue-N', 'Daly City to Dublin/Pleasanton', '1', '0099CC', 'FFFFFF', 'https://www.bart.gov/schedules/bylineresults?route=12'),
('bart', '19', 'Grey-N', 'Oakland Int''l Airport OAK to Coliseum', '1', 'B0BEC7', '000000', 'https://www.bart.gov/schedules/bylineresults?route=19'),
('bart', '20', 'Grey-S', 'Coliseum to Oakland Int''l Airport OAK', '1', 'B0BEC7', '000000', 'https://www.bart.gov/schedules/bylineresults?route=20'),
('bart', 'BB-A', 'BridgeA', 'Bus Bridge', '3', '000000', 'FFFFFF', NULL),
('bart', 'BB-B', 'BridgeB', 'Bus Bridge', '3', '000000', 'FFFFFF', NULL)
ON CONFLICT DO NOTHING;

-- Restore check: prints one line per table and sequence, so two databases can be compared line by line.
-- Tables:    table|<schema>.<table>|<rows>|<md5 of all rows>
-- Sequences: sequence|<schema>.<sequence>|<last value>
-- The table list is read from the schema, so new tables are included without editing this file.
-- Exact counts and a full read of every table: meant for this small app DB only.
SELECT 'table|' || t.table_schema || '.' || t.table_name || '|'
  || (xpath('/row/c/text()', x.doc))[1]::text || '|'
  || (xpath('/row/h/text()', x.doc))[1]::text
FROM information_schema.tables t
CROSS JOIN LATERAL (
  SELECT query_to_xml(
    format(
      'SELECT count(*) AS c, md5(coalesce(string_agg(r::text, chr(10) ORDER BY r::text), %L)) AS h FROM %I.%I r',
      '', t.table_schema, t.table_name
    ),
    false, true, ''
  ) AS doc
) x
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND t.table_type = 'BASE TABLE'
UNION ALL
SELECT 'sequence|' || schemaname || '.' || sequencename || '|' || coalesce(last_value::text, '-')
FROM pg_sequences
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;

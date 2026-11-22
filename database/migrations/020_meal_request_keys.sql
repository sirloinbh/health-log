-- Retry keys for the meal POST routes (#196). The screen sends one Idempotency-Key per user action; a retry
-- with the same key gets the first answer back instead of adding the entries again.
-- fingerprint: SHA-256 (hex) of the method, the path and the parsed body, so a key reused for a different
-- request is refused. answer: the JSON the first request answered with. Old keys are deleted by the API.
CREATE TABLE IF NOT EXISTS meal_request_keys (
  key uuid PRIMARY KEY,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  answer json NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_request_keys_created_at_idx ON meal_request_keys (created_at);

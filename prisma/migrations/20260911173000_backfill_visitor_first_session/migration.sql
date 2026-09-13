-- Identity v2 creates the visitor before its first session so the session can
-- reference that visitor. Backfill the missing first-session pointer from the
-- earliest session already attached to each visitor.
WITH first_sessions AS (
  SELECT DISTINCT ON ("website_id", "visitor_id")
    "website_id",
    "visitor_id",
    "session_id"
  FROM "session"
  WHERE "visitor_id" IS NOT NULL
  ORDER BY "website_id", "visitor_id", "created_at" ASC NULLS LAST, "session_id" ASC
)
UPDATE "visitor" AS visitor
SET
  "first_session_id" = first_sessions."session_id",
  "updated_at" = now()
FROM first_sessions
WHERE visitor."website_id" = first_sessions."website_id"
  AND visitor."visitor_id" = first_sessions."visitor_id"
  AND visitor."first_session_id" IS NULL;

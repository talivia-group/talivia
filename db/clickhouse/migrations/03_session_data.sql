CREATE TABLE talivia.event_data_new
(
    website_id UUID,
    session_id UUID,
    event_id UUID,
    url_path String,
    event_name String,
    data_key String,
    string_value Nullable(String),
    number_value Nullable(Decimal64(4)),
    date_value Nullable(DateTime('UTC')),
    data_type UInt32,
    created_at DateTime('UTC'),
    job_id Nullable(UUID)
)
    engine = MergeTree
        ORDER BY (website_id, event_id, data_key, created_at)
        SETTINGS index_granularity = 8192;

INSERT INTO talivia.event_data_new
SELECT website_id,
    session_id,
    event_id,
    url_path,
    event_name,
    event_key,
    string_value,
    number_value,
    date_value,
    data_type,
    created_at,
    NULL
FROM talivia.event_data;

CREATE TABLE talivia.session_data
(
    website_id UUID,
    session_id UUID,
    data_key String,
    string_value Nullable(String),
    number_value Nullable(Decimal64(4)),
    date_value Nullable(DateTime('UTC')),
    data_type UInt32,
    created_at DateTime('UTC'),
    job_id Nullable(UUID)
)
    engine = MergeTree
        ORDER BY (website_id, session_id, data_key, created_at)
        SETTINGS index_granularity = 8192;

RENAME TABLE talivia.event_data TO talivia.event_data_old;
RENAME TABLE talivia.event_data_new TO talivia.event_data;

/*
DROP TABLE talivia.event_data_old
 */


-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "user_id" UUID NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "password" VARCHAR(60) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "logo_url" VARCHAR(2183),
    "display_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "session" (
    "session_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_id" UUID,
    "browser" VARCHAR(20),
    "os" VARCHAR(20),
    "device" VARCHAR(20),
    "screen" VARCHAR(11),
    "language" VARCHAR(35),
    "country" CHAR(2),
    "region" VARCHAR(20),
    "city" VARCHAR(50),
    "distinct_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "website" (
    "website_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "domain" VARCHAR(500),
    "reset_at" TIMESTAMPTZ(6),
    "user_id" UUID,
    "team_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "replay_enabled" BOOLEAN NOT NULL DEFAULT false,
    "replay_config" JSONB,

    CONSTRAINT "website_pkey" PRIMARY KEY ("website_id")
);

-- CreateTable
CREATE TABLE "website_import" (
    "website_import_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "kind" VARCHAR(30) NOT NULL DEFAULT 'raw',
    "format" VARCHAR(100),
    "status" VARCHAR(30) NOT NULL DEFAULT 'processing',
    "file_name" VARCHAR(500) NOT NULL,
    "file_checksum" VARCHAR(64) NOT NULL,
    "data_start_at" TIMESTAMPTZ(6),
    "data_end_at" TIMESTAMPTZ(6),
    "imported_session_count" INTEGER NOT NULL DEFAULT 0,
    "imported_event_count" INTEGER NOT NULL DEFAULT 0,
    "imported_event_data_count" INTEGER NOT NULL DEFAULT 0,
    "imported_revenue_count" INTEGER NOT NULL DEFAULT 0,
    "imported_metric_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "error" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "website_import_pkey" PRIMARY KEY ("website_import_id")
);

-- CreateTable
CREATE TABLE "website_historical_metric" (
    "website_historical_metric_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "website_import_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "metric_date" DATE NOT NULL,
    "dimension" VARCHAR(50) NOT NULL,
    "dimension_value" VARCHAR(500) NOT NULL DEFAULT '',
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "events" INTEGER NOT NULL DEFAULT 0,
    "bounce_rate" DECIMAL(8,4),
    "visit_duration" INTEGER,
    "revenue" DECIMAL(19,4),
    "currency" VARCHAR(10),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_historical_metric_pkey" PRIMARY KEY ("website_historical_metric_id")
);

-- CreateTable
CREATE TABLE "website_event" (
    "event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_id" UUID,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "url_path" VARCHAR(500) NOT NULL,
    "url_query" VARCHAR(500),
    "utm_source" VARCHAR(255),
    "utm_medium" VARCHAR(255),
    "utm_campaign" VARCHAR(255),
    "utm_content" VARCHAR(255),
    "utm_term" VARCHAR(255),
    "referrer_path" VARCHAR(500),
    "referrer_query" VARCHAR(500),
    "referrer_domain" VARCHAR(500),
    "page_title" VARCHAR(500),
    "gclid" VARCHAR(255),
    "gclsrc" VARCHAR(255),
    "wbraid" VARCHAR(255),
    "gbraid" VARCHAR(255),
    "fbclid" VARCHAR(255),
    "msclkid" VARCHAR(255),
    "ttclid" VARCHAR(255),
    "li_fat_id" VARCHAR(255),
    "twclid" VARCHAR(255),
    "event_type" INTEGER NOT NULL DEFAULT 1,
    "event_name" VARCHAR(50),
    "tag" VARCHAR(50),
    "hostname" VARCHAR(100),
    "lcp" DECIMAL(10,1),
    "inp" DECIMAL(10,1),
    "cls" DECIMAL(10,4),
    "fcp" DECIMAL(10,1),
    "ttfb" DECIMAL(10,1),

    CONSTRAINT "website_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_data" (
    "event_data_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "website_event_id" UUID NOT NULL,
    "data_key" VARCHAR(500) NOT NULL,
    "string_value" VARCHAR(500),
    "number_value" DECIMAL(19,4),
    "date_value" TIMESTAMPTZ(6),
    "data_type" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_data_pkey" PRIMARY KEY ("event_data_id")
);

-- CreateTable
CREATE TABLE "session_data" (
    "session_data_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "data_key" VARCHAR(500) NOT NULL,
    "string_value" VARCHAR(500),
    "number_value" DECIMAL(19,4),
    "date_value" TIMESTAMPTZ(6),
    "data_type" INTEGER NOT NULL,
    "distinct_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_data_pkey" PRIMARY KEY ("session_data_id")
);

-- CreateTable
CREATE TABLE "team" (
    "team_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "access_code" VARCHAR(50),
    "logo_url" VARCHAR(2183),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "team_pkey" PRIMARY KEY ("team_id")
);

-- CreateTable
CREATE TABLE "team_user" (
    "team_user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "team_user_pkey" PRIMARY KEY ("team_user_id")
);

-- CreateTable
CREATE TABLE "website_member" (
    "website_member_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "user_id" UUID,
    "username" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "website_member_pkey" PRIMARY KEY ("website_member_id")
);

-- CreateTable
CREATE TABLE "report" (
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "segment" (
    "segment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "segment_pkey" PRIMARY KEY ("segment_id")
);

-- CreateTable
CREATE TABLE "revenue" (
    "revenue_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "revenue" DECIMAL(19,4),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_pkey" PRIMARY KEY ("revenue_id")
);

-- CreateTable
CREATE TABLE "link" (
    "link_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "link_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "pixel" (
    "pixel_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pixel_pkey" PRIMARY KEY ("pixel_id")
);

-- CreateTable
CREATE TABLE "board" (
    "board_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "parameters" JSONB NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "board_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "share" (
    "share_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "share_type" INTEGER NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "share_pkey" PRIMARY KEY ("share_id")
);

-- CreateTable
CREATE TABLE "session_replay" (
    "replay_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "events" BYTEA NOT NULL,
    "event_count" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_replay_pkey" PRIMARY KEY ("replay_id")
);

-- CreateTable
CREATE TABLE "session_replay_saved" (
    "saved_replay_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_replay_saved_pkey" PRIMARY KEY ("saved_replay_id")
);

-- CreateTable
CREATE TABLE "website_attribution_config" (
    "config_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "default_currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "currency_changed_at" TIMESTAMPTZ(6),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "attribution_model_default" VARCHAR(50) NOT NULL DEFAULT 'first_touch',
    "enable_payment_url_detection" BOOLEAN NOT NULL DEFAULT true,
    "enable_cross_domain_tracking" BOOLEAN NOT NULL DEFAULT true,
    "enable_external_link_tracking" BOOLEAN NOT NULL DEFAULT true,
    "enable_scroll_tracking" BOOLEAN NOT NULL DEFAULT false,
    "enable_attention_tracking" BOOLEAN NOT NULL DEFAULT false,
    "bot_filtering_mode" VARCHAR(50) NOT NULL DEFAULT 'standard',
    "internal_traffic_rules" JSONB,
    "ignored_query_params" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "website_attribution_config_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "website_domain" (
    "domain_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "hostname" VARCHAR(255) NOT NULL,
    "domain_type" VARCHAR(50) NOT NULL DEFAULT 'primary',
    "verification_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "website_domain_pkey" PRIMARY KEY ("domain_id")
);

-- CreateTable
CREATE TABLE "visitor" (
    "visitor_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_token" VARCHAR(100) NOT NULL,
    "first_session_id" UUID,
    "last_session_id" UUID,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "first_source" VARCHAR(255),
    "first_medium" VARCHAR(255),
    "first_campaign" VARCHAR(255),
    "first_referrer_domain" VARCHAR(500),
    "first_referrer_path" VARCHAR(500),
    "first_referrer_query" VARCHAR(500),
    "first_landing_path" VARCHAR(500),
    "first_country" CHAR(2),
    "first_device" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitor_pkey" PRIMARY KEY ("visitor_id")
);

-- CreateTable
CREATE TABLE "customer_identity" (
    "customer_identity_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "external_customer_id" VARCHAR(255),
    "provider_customer_id" VARCHAR(255),
    "email_hash" VARCHAR(255),
    "email_encrypted" TEXT,
    "name" VARCHAR(255),
    "avatar_url" VARCHAR(2183),
    "metadata" JSONB,
    "first_identified_at" TIMESTAMPTZ(6),
    "last_identified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_identity_pkey" PRIMARY KEY ("customer_identity_id")
);

-- CreateTable
CREATE TABLE "visitor_identity_link" (
    "link_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "session_id" UUID,
    "customer_identity_id" UUID,
    "provider_name" VARCHAR(50),
    "provider_customer_id" VARCHAR(255),
    "email_hash" VARCHAR(255),
    "match_method" VARCHAR(50) NOT NULL,
    "match_confidence" VARCHAR(50) NOT NULL,
    "first_matched_at" TIMESTAMPTZ(6) NOT NULL,
    "last_matched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitor_identity_link_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "payment_provider_connection" (
    "connection_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "provider_name" VARCHAR(50) NOT NULL,
    "connection_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "provider_account_id" VARCHAR(255),
    "credentials_ref" TEXT,
    "webhook_secret_ref" TEXT,
    "provider_webhook_endpoint_id" VARCHAR(255),
    "webhook_status" VARCHAR(50) NOT NULL DEFAULT 'not_configured',
    "provisioning_token" UUID,
    "provisioning_started_at" TIMESTAMPTZ(6),
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "disconnected_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_provider_connection_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "provider_webhook_cleanup_job" (
    "cleanup_job_id" UUID NOT NULL,
    "website_id" UUID,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_webhook_endpoint_id" VARCHAR(255) NOT NULL,
    "credentials_ref" TEXT,
    "job_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_webhook_cleanup_job_pkey" PRIMARY KEY ("cleanup_job_id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "subscription_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "connection_id" UUID,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_subscription_id" VARCHAR(255) NOT NULL,
    "provider_customer_id" VARCHAR(255),
    "customer_identity_id" UUID,
    "visitor_id" UUID,
    "session_id" UUID,
    "status" VARCHAR(50) NOT NULL,
    "lifecycle_status" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(255),
    "product_name" VARCHAR(255),
    "plan_id" VARCHAR(255),
    "plan_name" VARCHAR(255),
    "quantity" INTEGER,
    "currency" VARCHAR(10),
    "mrr_amount" DECIMAL(19,4),
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "trial_start" TIMESTAMPTZ(6),
    "trial_end" TIMESTAMPTZ(6),
    "cancel_at" TIMESTAMPTZ(6),
    "canceled_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "last_event_type" VARCHAR(100),
    "last_event_at" TIMESTAMPTZ(6) NOT NULL,
    "last_event_priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "provider_event" (
    "provider_event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "connection_id" UUID,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_event_key" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processing_status" VARCHAR(50) NOT NULL DEFAULT 'received',
    "raw_payload" JSONB,
    "raw_payload_ref" TEXT,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_event_pkey" PRIMARY KEY ("provider_event_id")
);

-- CreateTable
CREATE TABLE "payment" (
    "payment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "connection_id" UUID,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_payment_id" VARCHAR(255),
    "provider_subscription_id" VARCHAR(255),
    "provider_checkout_id" VARCHAR(255),
    "provider_customer_id" VARCHAR(255),
    "transaction_id" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "reporting_amount" DECIMAL(19,4),
    "reporting_currency" VARCHAR(10),
    "payment_status" VARCHAR(50) NOT NULL,
    "customer_identity_id" UUID,
    "visitor_id" UUID,
    "session_id" UUID,
    "email_hash" VARCHAR(255),
    "is_renewal" BOOLEAN NOT NULL DEFAULT false,
    "is_refunded" BOOLEAN NOT NULL DEFAULT false,
    "refund_amount" DECIMAL(19,4),
    "is_disputed" BOOLEAN NOT NULL DEFAULT false,
    "dispute_amount" DECIMAL(19,4),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_payload_ref" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payment_dispute" (
    "payment_dispute_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_dispute_id" VARCHAR(255) NOT NULL,
    "provider_payment_id" VARCHAR(255),
    "provider_charge_id" VARCHAR(255),
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "reason" VARCHAR(255),
    "is_revenue_reversed" BOOLEAN NOT NULL DEFAULT false,
    "evidence_due_at" TIMESTAMPTZ(6),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_dispute_pkey" PRIMARY KEY ("payment_dispute_id")
);

-- CreateTable
CREATE TABLE "payment_detection_event" (
    "detection_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_id" UUID,
    "session_id" UUID,
    "website_event_id" UUID,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_checkout_id" VARCHAR(255) NOT NULL,
    "url_path" VARCHAR(500),
    "url_query" VARCHAR(500),
    "matched_payment_id" UUID,
    "matching_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_detection_event_pkey" PRIMARY KEY ("detection_id")
);

-- CreateTable
CREATE TABLE "refund" (
    "refund_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "provider_name" VARCHAR(50) NOT NULL,
    "provider_refund_id" VARCHAR(255),
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(255),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "payment_match" (
    "payment_match_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "visitor_id" UUID,
    "session_id" UUID,
    "customer_identity_id" UUID,
    "payment_detection_id" UUID,
    "match_method" VARCHAR(50) NOT NULL,
    "match_confidence" VARCHAR(50) NOT NULL,
    "match_reason" TEXT,
    "matched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_match_pkey" PRIMARY KEY ("payment_match_id")
);

-- CreateTable
CREATE TABLE "payment_attribution" (
    "payment_attribution_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "visitor_id" UUID,
    "session_id" UUID,
    "payment_match_id" UUID,
    "attribution_model" VARCHAR(50) NOT NULL,
    "attribution_confidence" VARCHAR(50) NOT NULL,
    "first_touch_source" VARCHAR(255),
    "first_touch_medium" VARCHAR(255),
    "first_touch_campaign" VARCHAR(255),
    "first_touch_referrer_domain" VARCHAR(500),
    "first_touch_referrer_path" VARCHAR(500),
    "first_touch_referrer_query" VARCHAR(500),
    "first_touch_landing_path" VARCHAR(500),
    "last_touch_source" VARCHAR(255),
    "last_touch_medium" VARCHAR(255),
    "last_touch_campaign" VARCHAR(255),
    "last_touch_referrer_domain" VARCHAR(500),
    "last_touch_referrer_path" VARCHAR(500),
    "last_touch_referrer_query" VARCHAR(500),
    "last_touch_landing_path" VARCHAR(500),
    "conversion_path" VARCHAR(500),
    "conversion_event_id" UUID,
    "revenue_amount" DECIMAL(19,4) NOT NULL,
    "revenue_currency" VARCHAR(10) NOT NULL,
    "is_renewal" BOOLEAN NOT NULL DEFAULT false,
    "is_refunded" BOOLEAN NOT NULL DEFAULT false,
    "unattributed_reason" VARCHAR(255),
    "calculated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_attribution_pkey" PRIMARY KEY ("payment_attribution_id")
);

-- CreateTable
CREATE TABLE "attribution_job" (
    "attribution_job_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "payment_id" UUID,
    "job_type" VARCHAR(50) NOT NULL,
    "job_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attribution_job_pkey" PRIMARY KEY ("attribution_job_id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "api_key_id" UUID NOT NULL,
    "team_id" UUID,
    "user_id" UUID,
    "website_id" UUID,
    "key_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("api_key_id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "audit_event_id" UUID NOT NULL,
    "team_id" UUID,
    "user_id" UUID,
    "website_id" UUID,
    "event_type" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100),
    "resource_id" UUID,
    "ip_address" VARCHAR(100),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("audit_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_created_at_idx" ON "session"("created_at");

-- CreateIndex
CREATE INDEX "session_website_id_idx" ON "session"("website_id");

-- CreateIndex
CREATE INDEX "session_website_id_visitor_id_idx" ON "session"("website_id", "visitor_id");

-- CreateIndex
CREATE INDEX "session_visitor_id_idx" ON "session"("visitor_id");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_idx" ON "session"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_browser_idx" ON "session"("website_id", "created_at", "browser");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_os_idx" ON "session"("website_id", "created_at", "os");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_device_idx" ON "session"("website_id", "created_at", "device");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_screen_idx" ON "session"("website_id", "created_at", "screen");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_language_idx" ON "session"("website_id", "created_at", "language");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_country_idx" ON "session"("website_id", "created_at", "country");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_region_idx" ON "session"("website_id", "created_at", "region");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_city_idx" ON "session"("website_id", "created_at", "city");

-- CreateIndex
CREATE INDEX "website_user_id_idx" ON "website"("user_id");

-- CreateIndex
CREATE INDEX "website_team_id_idx" ON "website"("team_id");

-- CreateIndex
CREATE INDEX "website_created_at_idx" ON "website"("created_at");

-- CreateIndex
CREATE INDEX "website_created_by_idx" ON "website"("created_by");

-- CreateIndex
CREATE INDEX "website_import_website_id_created_at_idx" ON "website_import"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "website_import_website_id_source_idx" ON "website_import"("website_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "website_import_website_id_source_file_checksum_key" ON "website_import"("website_id", "source", "file_checksum");

-- CreateIndex
CREATE INDEX "website_historical_metric_website_id_metric_date_idx" ON "website_historical_metric"("website_id", "metric_date");

-- CreateIndex
CREATE INDEX "website_historical_metric_website_id_dimension_metric_date_idx" ON "website_historical_metric"("website_id", "dimension", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "website_historical_metric_website_import_id_metric_date_dim_key" ON "website_historical_metric"("website_import_id", "metric_date", "dimension", "dimension_value");

-- CreateIndex
CREATE INDEX "website_event_created_at_idx" ON "website_event"("created_at");

-- CreateIndex
CREATE INDEX "website_event_session_id_idx" ON "website_event"("session_id");

-- CreateIndex
CREATE INDEX "website_event_visitor_id_idx" ON "website_event"("visitor_id");

-- CreateIndex
CREATE INDEX "website_event_website_id_idx" ON "website_event"("website_id");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_idx" ON "website_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_url_path_idx" ON "website_event"("website_id", "created_at", "url_path");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_url_query_idx" ON "website_event"("website_id", "created_at", "url_query");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_referrer_domain_idx" ON "website_event"("website_id", "created_at", "referrer_domain");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_page_title_idx" ON "website_event"("website_id", "created_at", "page_title");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_event_name_idx" ON "website_event"("website_id", "created_at", "event_name");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_tag_idx" ON "website_event"("website_id", "created_at", "tag");

-- CreateIndex
CREATE INDEX "website_event_website_id_session_id_created_at_idx" ON "website_event"("website_id", "session_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_visitor_id_created_at_idx" ON "website_event"("website_id", "visitor_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_hostname_idx" ON "website_event"("website_id", "created_at", "hostname");

-- CreateIndex
CREATE INDEX "event_data_created_at_idx" ON "event_data"("created_at");

-- CreateIndex
CREATE INDEX "event_data_website_id_idx" ON "event_data"("website_id");

-- CreateIndex
CREATE INDEX "event_data_website_event_id_idx" ON "event_data"("website_event_id");

-- CreateIndex
CREATE INDEX "event_data_website_id_created_at_idx" ON "event_data"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "event_data_website_id_created_at_data_key_idx" ON "event_data"("website_id", "created_at", "data_key");

-- CreateIndex
CREATE INDEX "session_data_created_at_idx" ON "session_data"("created_at");

-- CreateIndex
CREATE INDEX "session_data_website_id_idx" ON "session_data"("website_id");

-- CreateIndex
CREATE INDEX "session_data_session_id_idx" ON "session_data"("session_id");

-- CreateIndex
CREATE INDEX "session_data_session_id_created_at_idx" ON "session_data"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "session_data_website_id_created_at_data_key_idx" ON "session_data"("website_id", "created_at", "data_key");

-- CreateIndex
CREATE UNIQUE INDEX "session_data_session_id_data_key_key" ON "session_data"("session_id", "data_key");

-- CreateIndex
CREATE UNIQUE INDEX "team_access_code_key" ON "team"("access_code");

-- CreateIndex
CREATE INDEX "team_access_code_idx" ON "team"("access_code");

-- CreateIndex
CREATE INDEX "team_user_team_id_idx" ON "team_user"("team_id");

-- CreateIndex
CREATE INDEX "team_user_user_id_idx" ON "team_user"("user_id");

-- CreateIndex
CREATE INDEX "website_member_website_id_idx" ON "website_member"("website_id");

-- CreateIndex
CREATE INDEX "website_member_user_id_idx" ON "website_member"("user_id");

-- CreateIndex
CREATE INDEX "website_member_username_idx" ON "website_member"("username");

-- CreateIndex
CREATE INDEX "website_member_invited_by_user_id_idx" ON "website_member"("invited_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_member_website_id_username_key" ON "website_member"("website_id", "username");

-- CreateIndex
CREATE INDEX "report_user_id_idx" ON "report"("user_id");

-- CreateIndex
CREATE INDEX "report_website_id_idx" ON "report"("website_id");

-- CreateIndex
CREATE INDEX "report_type_idx" ON "report"("type");

-- CreateIndex
CREATE INDEX "report_name_idx" ON "report"("name");

-- CreateIndex
CREATE INDEX "segment_website_id_idx" ON "segment"("website_id");

-- CreateIndex
CREATE INDEX "revenue_website_id_idx" ON "revenue"("website_id");

-- CreateIndex
CREATE INDEX "revenue_session_id_idx" ON "revenue"("session_id");

-- CreateIndex
CREATE INDEX "revenue_website_id_created_at_idx" ON "revenue"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "revenue_website_id_session_id_created_at_idx" ON "revenue"("website_id", "session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "link_slug_key" ON "link"("slug");

-- CreateIndex
CREATE INDEX "link_slug_idx" ON "link"("slug");

-- CreateIndex
CREATE INDEX "link_user_id_idx" ON "link"("user_id");

-- CreateIndex
CREATE INDEX "link_team_id_idx" ON "link"("team_id");

-- CreateIndex
CREATE INDEX "link_created_at_idx" ON "link"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pixel_slug_key" ON "pixel"("slug");

-- CreateIndex
CREATE INDEX "pixel_slug_idx" ON "pixel"("slug");

-- CreateIndex
CREATE INDEX "pixel_user_id_idx" ON "pixel"("user_id");

-- CreateIndex
CREATE INDEX "pixel_team_id_idx" ON "pixel"("team_id");

-- CreateIndex
CREATE INDEX "pixel_created_at_idx" ON "pixel"("created_at");

-- CreateIndex
CREATE INDEX "board_user_id_idx" ON "board"("user_id");

-- CreateIndex
CREATE INDEX "board_team_id_idx" ON "board"("team_id");

-- CreateIndex
CREATE INDEX "board_created_at_idx" ON "board"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_slug_key" ON "share"("slug");

-- CreateIndex
CREATE INDEX "share_entity_id_idx" ON "share"("entity_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_idx" ON "session_replay"("website_id");

-- CreateIndex
CREATE INDEX "session_replay_session_id_idx" ON "session_replay"("session_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_session_id_idx" ON "session_replay"("website_id", "session_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_created_at_idx" ON "session_replay"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "session_replay_session_id_chunk_index_idx" ON "session_replay"("session_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "session_replay_saved_session_id_key" ON "session_replay_saved"("session_id");

-- CreateIndex
CREATE INDEX "session_replay_saved_website_id_idx" ON "session_replay_saved"("website_id");

-- CreateIndex
CREATE INDEX "session_replay_saved_session_id_idx" ON "session_replay_saved"("session_id");

-- CreateIndex
CREATE INDEX "session_replay_saved_website_id_created_at_idx" ON "session_replay_saved"("website_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_attribution_config_website_id_key" ON "website_attribution_config"("website_id");

-- CreateIndex
CREATE INDEX "website_domain_website_id_idx" ON "website_domain"("website_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_domain_website_id_hostname_key" ON "website_domain"("website_id", "hostname");

-- CreateIndex
CREATE INDEX "visitor_website_id_first_seen_at_idx" ON "visitor"("website_id", "first_seen_at");

-- CreateIndex
CREATE INDEX "visitor_website_id_last_seen_at_idx" ON "visitor"("website_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "visitor_website_id_first_source_idx" ON "visitor"("website_id", "first_source");

-- CreateIndex
CREATE INDEX "visitor_website_id_first_campaign_idx" ON "visitor"("website_id", "first_campaign");

-- CreateIndex
CREATE INDEX "visitor_website_id_first_referrer_domain_idx" ON "visitor"("website_id", "first_referrer_domain");

-- CreateIndex
CREATE INDEX "visitor_website_id_first_referrer_path_idx" ON "visitor"("website_id", "first_referrer_path");

-- CreateIndex
CREATE INDEX "visitor_first_session_id_idx" ON "visitor"("first_session_id");

-- CreateIndex
CREATE INDEX "visitor_last_session_id_idx" ON "visitor"("last_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_website_id_visitor_token_key" ON "visitor"("website_id", "visitor_token");

-- CreateIndex
CREATE INDEX "customer_identity_website_id_idx" ON "customer_identity"("website_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identity_website_id_external_customer_id_key" ON "customer_identity"("website_id", "external_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identity_website_id_provider_customer_id_key" ON "customer_identity"("website_id", "provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identity_website_id_email_hash_key" ON "customer_identity"("website_id", "email_hash");

-- CreateIndex
CREATE INDEX "visitor_identity_link_website_id_visitor_id_idx" ON "visitor_identity_link"("website_id", "visitor_id");

-- CreateIndex
CREATE INDEX "visitor_identity_link_website_id_customer_identity_id_idx" ON "visitor_identity_link"("website_id", "customer_identity_id");

-- CreateIndex
CREATE INDEX "visitor_identity_link_website_id_provider_name_provider_cus_idx" ON "visitor_identity_link"("website_id", "provider_name", "provider_customer_id");

-- CreateIndex
CREATE INDEX "visitor_identity_link_website_id_email_hash_idx" ON "visitor_identity_link"("website_id", "email_hash");

-- CreateIndex
CREATE INDEX "visitor_identity_link_session_id_idx" ON "visitor_identity_link"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_identity_link_visitor_customer_key" ON "visitor_identity_link"("website_id", "visitor_id", "customer_identity_id");

-- CreateIndex
CREATE INDEX "payment_provider_connection_website_id_idx" ON "payment_provider_connection"("website_id");

-- CreateIndex
CREATE INDEX "payment_provider_connection_provider_name_connection_status_idx" ON "payment_provider_connection"("provider_name", "connection_status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_connection_website_id_provider_name_provid_key" ON "payment_provider_connection"("website_id", "provider_name", "provider_account_id");

-- CreateIndex
CREATE INDEX "provider_webhook_cleanup_job_job_status_next_attempt_at_idx" ON "provider_webhook_cleanup_job"("job_status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_cleanup_job_provider_name_provider_webhook_key" ON "provider_webhook_cleanup_job"("provider_name", "provider_webhook_endpoint_id");

-- CreateIndex
CREATE INDEX "subscription_website_id_lifecycle_status_idx" ON "subscription"("website_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "subscription_website_id_status_idx" ON "subscription"("website_id", "status");

-- CreateIndex
CREATE INDEX "subscription_website_id_provider_name_provider_customer_id_idx" ON "subscription"("website_id", "provider_name", "provider_customer_id");

-- CreateIndex
CREATE INDEX "subscription_website_id_current_period_end_idx" ON "subscription"("website_id", "current_period_end");

-- CreateIndex
CREATE INDEX "subscription_website_id_last_event_at_idx" ON "subscription"("website_id", "last_event_at");

-- CreateIndex
CREATE INDEX "subscription_connection_id_idx" ON "subscription"("connection_id");

-- CreateIndex
CREATE INDEX "subscription_customer_identity_id_idx" ON "subscription"("customer_identity_id");

-- CreateIndex
CREATE INDEX "subscription_visitor_id_idx" ON "subscription"("visitor_id");

-- CreateIndex
CREATE INDEX "subscription_session_id_idx" ON "subscription"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_website_id_provider_name_provider_subscription_key" ON "subscription"("website_id", "provider_name", "provider_subscription_id");

-- CreateIndex
CREATE INDEX "provider_event_website_id_received_at_idx" ON "provider_event"("website_id", "received_at");

-- CreateIndex
CREATE INDEX "provider_event_connection_id_idx" ON "provider_event"("connection_id");

-- CreateIndex
CREATE INDEX "provider_event_processing_status_idx" ON "provider_event"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_event_provider_name_provider_event_key_key" ON "provider_event"("provider_name", "provider_event_key");

-- CreateIndex
CREATE INDEX "payment_website_id_occurred_at_idx" ON "payment"("website_id", "occurred_at");

-- CreateIndex
CREATE INDEX "payment_website_id_provider_name_provider_payment_id_idx" ON "payment"("website_id", "provider_name", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_website_id_provider_name_provider_subscription_id_o_idx" ON "payment"("website_id", "provider_name", "provider_subscription_id", "occurred_at", "transaction_id");

-- CreateIndex
CREATE INDEX "payment_website_id_provider_checkout_id_idx" ON "payment"("website_id", "provider_checkout_id");

-- CreateIndex
CREATE INDEX "payment_website_id_provider_customer_id_idx" ON "payment"("website_id", "provider_customer_id");

-- CreateIndex
CREATE INDEX "payment_website_id_visitor_id_idx" ON "payment"("website_id", "visitor_id");

-- CreateIndex
CREATE INDEX "payment_website_id_session_id_idx" ON "payment"("website_id", "session_id");

-- CreateIndex
CREATE INDEX "payment_website_id_customer_identity_id_idx" ON "payment"("website_id", "customer_identity_id");

-- CreateIndex
CREATE INDEX "payment_website_id_email_hash_idx" ON "payment"("website_id", "email_hash");

-- CreateIndex
CREATE INDEX "payment_website_id_payment_status_idx" ON "payment"("website_id", "payment_status");

-- CreateIndex
CREATE INDEX "payment_connection_id_idx" ON "payment"("connection_id");

-- CreateIndex
CREATE INDEX "payment_customer_identity_id_idx" ON "payment"("customer_identity_id");

-- CreateIndex
CREATE INDEX "payment_visitor_id_idx" ON "payment"("visitor_id");

-- CreateIndex
CREATE INDEX "payment_session_id_idx" ON "payment"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_website_id_provider_name_transaction_id_key" ON "payment"("website_id", "provider_name", "transaction_id");

-- CreateIndex
CREATE INDEX "payment_dispute_payment_id_idx" ON "payment_dispute"("payment_id");

-- CreateIndex
CREATE INDEX "payment_dispute_website_id_occurred_at_idx" ON "payment_dispute"("website_id", "occurred_at");

-- CreateIndex
CREATE INDEX "payment_dispute_website_id_status_idx" ON "payment_dispute"("website_id", "status");

-- CreateIndex
CREATE INDEX "payment_dispute_website_id_provider_payment_id_idx" ON "payment_dispute"("website_id", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_dispute_website_id_provider_charge_id_idx" ON "payment_dispute"("website_id", "provider_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_dispute_website_id_provider_name_provider_dispute_i_key" ON "payment_dispute"("website_id", "provider_name", "provider_dispute_id");

-- CreateIndex
CREATE INDEX "payment_detection_event_website_id_occurred_at_idx" ON "payment_detection_event"("website_id", "occurred_at");

-- CreateIndex
CREATE INDEX "payment_detection_event_website_id_provider_checkout_id_idx" ON "payment_detection_event"("website_id", "provider_checkout_id");

-- CreateIndex
CREATE INDEX "payment_detection_event_matched_payment_id_idx" ON "payment_detection_event"("matched_payment_id");

-- CreateIndex
CREATE INDEX "payment_detection_event_visitor_id_idx" ON "payment_detection_event"("visitor_id");

-- CreateIndex
CREATE INDEX "payment_detection_event_session_id_idx" ON "payment_detection_event"("session_id");

-- CreateIndex
CREATE INDEX "payment_detection_event_website_event_id_idx" ON "payment_detection_event"("website_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_detection_event_website_id_provider_name_provider_c_key" ON "payment_detection_event"("website_id", "provider_name", "provider_checkout_id", "visitor_id");

-- CreateIndex
CREATE INDEX "refund_payment_id_idx" ON "refund"("payment_id");

-- CreateIndex
CREATE INDEX "refund_website_id_occurred_at_idx" ON "refund"("website_id", "occurred_at");

-- CreateIndex
CREATE INDEX "refund_website_id_idx" ON "refund"("website_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_website_id_provider_name_provider_refund_id_key" ON "refund"("website_id", "provider_name", "provider_refund_id");

-- CreateIndex
CREATE INDEX "payment_match_website_id_matched_at_idx" ON "payment_match"("website_id", "matched_at");

-- CreateIndex
CREATE INDEX "payment_match_website_id_visitor_id_idx" ON "payment_match"("website_id", "visitor_id");

-- CreateIndex
CREATE INDEX "payment_match_website_id_session_id_idx" ON "payment_match"("website_id", "session_id");

-- CreateIndex
CREATE INDEX "payment_match_website_id_customer_identity_id_idx" ON "payment_match"("website_id", "customer_identity_id");

-- CreateIndex
CREATE INDEX "payment_match_payment_detection_id_idx" ON "payment_match"("payment_detection_id");

-- CreateIndex
CREATE INDEX "payment_match_visitor_id_idx" ON "payment_match"("visitor_id");

-- CreateIndex
CREATE INDEX "payment_match_session_id_idx" ON "payment_match"("session_id");

-- CreateIndex
CREATE INDEX "payment_match_customer_identity_id_idx" ON "payment_match"("customer_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_match_payment_id_match_method_key" ON "payment_match"("payment_id", "match_method");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_calculated_at_idx" ON "payment_attribution"("website_id", "calculated_at");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_attribution_model_idx" ON "payment_attribution"("website_id", "attribution_model");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_attribution_confidence_idx" ON "payment_attribution"("website_id", "attribution_confidence");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_first_touch_source_idx" ON "payment_attribution"("website_id", "first_touch_source");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_first_touch_campaign_idx" ON "payment_attribution"("website_id", "first_touch_campaign");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_first_touch_referrer_domain_idx" ON "payment_attribution"("website_id", "first_touch_referrer_domain");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_first_touch_referrer_path_idx" ON "payment_attribution"("website_id", "first_touch_referrer_path");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_first_touch_landing_path_idx" ON "payment_attribution"("website_id", "first_touch_landing_path");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_last_touch_source_idx" ON "payment_attribution"("website_id", "last_touch_source");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_last_touch_campaign_idx" ON "payment_attribution"("website_id", "last_touch_campaign");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_last_touch_referrer_domain_idx" ON "payment_attribution"("website_id", "last_touch_referrer_domain");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_last_touch_referrer_path_idx" ON "payment_attribution"("website_id", "last_touch_referrer_path");

-- CreateIndex
CREATE INDEX "payment_attribution_website_id_last_touch_landing_path_idx" ON "payment_attribution"("website_id", "last_touch_landing_path");

-- CreateIndex
CREATE INDEX "payment_attribution_visitor_id_idx" ON "payment_attribution"("visitor_id");

-- CreateIndex
CREATE INDEX "payment_attribution_session_id_idx" ON "payment_attribution"("session_id");

-- CreateIndex
CREATE INDEX "payment_attribution_payment_match_id_idx" ON "payment_attribution"("payment_match_id");

-- CreateIndex
CREATE INDEX "payment_attribution_conversion_event_id_idx" ON "payment_attribution"("conversion_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attribution_payment_id_attribution_model_key" ON "payment_attribution"("payment_id", "attribution_model");

-- CreateIndex
CREATE INDEX "attribution_job_job_status_scheduled_at_idx" ON "attribution_job"("job_status", "scheduled_at");

-- CreateIndex
CREATE INDEX "attribution_job_website_id_created_at_idx" ON "attribution_job"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "attribution_job_website_id_idx" ON "attribution_job"("website_id");

-- CreateIndex
CREATE INDEX "attribution_job_payment_id_idx" ON "attribution_job"("payment_id");

-- CreateIndex
CREATE INDEX "api_key_team_id_idx" ON "api_key"("team_id");

-- CreateIndex
CREATE INDEX "api_key_user_id_idx" ON "api_key"("user_id");

-- CreateIndex
CREATE INDEX "api_key_website_id_idx" ON "api_key"("website_id");

-- CreateIndex
CREATE INDEX "api_key_key_hash_idx" ON "api_key"("key_hash");

-- CreateIndex
CREATE INDEX "audit_event_team_id_created_at_idx" ON "audit_event"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_user_id_created_at_idx" ON "audit_event"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_website_id_created_at_idx" ON "audit_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_event_type_idx" ON "audit_event"("event_type");

-- Bootstrap the only initial user. Change this password immediately after first login.
INSERT INTO "user" (
    "user_id",
    "username",
    "password",
    "role",
    "created_at",
    "updated_at"
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'admin',
    '$2b$10$vwQ2l6wWn280bLN6G28g.eCRpi2Jz8xicKOMbpbmZN7Gq3jBGJFYi',
    'admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

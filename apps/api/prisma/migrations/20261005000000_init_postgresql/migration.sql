-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "candidate_limit" INTEGER NOT NULL,
    "ai_credit_limit" INTEGER NOT NULL,
    "proctoring_minutes_limit" INTEGER NOT NULL,
    "seat_limit" INTEGER NOT NULL DEFAULT 5,
    "price_label" VARCHAR(1000),
    "billing_interval" VARCHAR(1000) NOT NULL DEFAULT 'month',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "stripe_product_id" VARCHAR(1000),
    "stripe_price_id" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "slug" VARCHAR(1000) NOT NULL,
    "region" VARCHAR(1000) NOT NULL DEFAULT 'us',
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "logo_path" VARCHAR(1000),
    "primary_color" VARCHAR(1000),
    "accent_color" VARCHAR(1000),
    "text_color" VARCHAR(1000),
    "login_watermark_enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtp_host" VARCHAR(1000),
    "smtp_port" INTEGER,
    "smtp_user" VARCHAR(1000),
    "smtp_password_encrypted" VARCHAR(1000),
    "email_from_address" VARCHAR(1000),
    "ai_api_key_encrypted" VARCHAR(1000),
    "ai_provider" VARCHAR(1000) NOT NULL DEFAULT 'anthropic',
    "ai_base_url" VARCHAR(1000),
    "ai_model_fast" VARCHAR(1000),
    "ai_model_standard" VARCHAR(1000),
    "embedding_api_key_encrypted" VARCHAR(1000),
    "embedding_base_url" VARCHAR(1000),
    "embedding_model" VARCHAR(1000),
    "api_key_hash" VARCHAR(1000),
    "api_key_prefix" VARCHAR(1000),
    "api_key_created_at" TIMESTAMPTZ(3),
    "webhook_url" VARCHAR(1000),
    "webhook_secret_encrypted" VARCHAR(1000),
    "saml_enabled" BOOLEAN NOT NULL DEFAULT false,
    "saml_idp_entity_id" VARCHAR(1000),
    "saml_idp_sso_url" VARCHAR(1000),
    "saml_idp_certificate" VARCHAR(1000),
    "auto_archive_siblings_on_hire" BOOLEAN NOT NULL DEFAULT true,
    "business_hours_json" VARCHAR(1000),
    "holidays_json" VARCHAR(1000),
    "field_permissions_json" VARCHAR(1000),
    "record_visibility_enabled" BOOLEAN NOT NULL DEFAULT false,
    "plan_id" UUID NOT NULL,
    "billing_status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "stripe_customer_id" VARCHAR(1000),
    "stripe_subscription_id" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apply_consent_text" VARCHAR(1000),
    "apply_consent_version" INTEGER NOT NULL DEFAULT 1,
    "careers_enabled" BOOLEAN NOT NULL DEFAULT false,
    "careers_headline" VARCHAR(1000),
    "careers_intro" VARCHAR(1000),
    "careers_banner_path" VARCHAR(1000),
    "careers_assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_provider" VARCHAR(1000) NOT NULL DEFAULT 'twilio',
    "sms_config_encrypted" VARCHAR(1000),
    "easy_apply_config_encrypted" VARCHAR(1000),
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_provider" VARCHAR(1000) NOT NULL DEFAULT 'twilio',
    "whatsapp_config_encrypted" VARCHAR(1000),
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_report_enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_report_recipients_json" VARCHAR(1000),
    "scheduled_report_last_sent_at" TIMESTAMPTZ(3),
    "hris_export_enabled" BOOLEAN NOT NULL DEFAULT false,
    "hris_provider" VARCHAR(1000) NOT NULL DEFAULT 'generic',
    "hris_target_url" VARCHAR(1000),
    "hris_auth_header_encrypted" VARCHAR(1000),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_notices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dimension" VARCHAR(1000) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "label" VARCHAR(1000) NOT NULL,
    "target_url_encrypted" VARCHAR(1000) NOT NULL,
    "events" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "last_delivery_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "event_type" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "http_status_code" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_detail" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ(3),

    CONSTRAINT "integration_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hris_export_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "payload_json" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "http_status_code" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_detail" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ(3),

    CONSTRAINT "hris_export_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(1000) NOT NULL,
    "payload_json" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "http_status_code" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_login_codes" (
    "id" UUID NOT NULL,
    "code_hash" VARCHAR(1000) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "email" CITEXT NOT NULL,
    "name" VARCHAR(1000),
    "time_zone" VARCHAR(1000),
    "email_signature" VARCHAR(1000),
    "notification_digest" VARCHAR(1000) NOT NULL DEFAULT 'immediate',
    "last_digest_sent_at" TIMESTAMPTZ(3),
    "password_hash" VARCHAR(1000) NOT NULL,
    "role" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "avatar_path" VARCHAR(1000),
    "last_login_at" TIMESTAMPTZ(3),
    "manager_id" UUID,
    "permission_profile_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(1000) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" VARCHAR(1000) NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(1000) NOT NULL,
    "family_id" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_tokens" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "work_email" VARCHAR(1000) NOT NULL,
    "company" VARCHAR(1000) NOT NULL,
    "team_size" VARCHAR(1000),
    "message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(1000) NOT NULL,
    "entity_type" VARCHAR(1000) NOT NULL,
    "entity_id" VARCHAR(1000),
    "actor_email" VARCHAR(1000),
    "actor_name" VARCHAR(1000),
    "actor_role" VARCHAR(1000),
    "metadata_json" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "service" VARCHAR(1000) NOT NULL,
    "severity" VARCHAR(1000) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "context_json" VARCHAR(1000),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "topic" VARCHAR(1000),
    "category" VARCHAR(1000),
    "difficulty" VARCHAR(1000) NOT NULL,
    "marks" INTEGER NOT NULL,
    "negative_marks" INTEGER NOT NULL DEFAULT 0,
    "partial_credit" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_job_id" UUID,
    "language_mode" VARCHAR(1000) NOT NULL DEFAULT 'fixed',
    "allowed_languages" VARCHAR(1000),
    "starter_code" VARCHAR(1000),
    "allow_stdin" BOOLEAN NOT NULL DEFAULT false,
    "code_tests_json" VARCHAR(1000),
    "model_answer" VARCHAR(1000),
    "snippet_code" VARCHAR(1000),
    "snippet_language" VARCHAR(1000),
    "image_url" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer_key_changed_at" TIMESTAMPTZ(3),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "order_index" INTEGER NOT NULL,
    "image_url" VARCHAR(1000),

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_in_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_user_id" UUID,

    CONSTRAINT "walk_in_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "walk_in_group_id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_tags" (
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "instructions" VARCHAR(1000),
    "status" VARCHAR(1000) NOT NULL DEFAULT 'draft',
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "pass_criteria_percent" INTEGER NOT NULL DEFAULT 40,
    "randomize_order" BOOLEAN NOT NULL DEFAULT false,
    "feedback_visibility" VARCHAR(1000) NOT NULL DEFAULT 'pass_fail',
    "results_release_mode" VARCHAR(1000) NOT NULL DEFAULT 'immediate',
    "certificates_enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduling_enabled" BOOLEAN NOT NULL DEFAULT false,
    "availability_window_start" TIMESTAMPTZ(3),
    "availability_window_end" TIMESTAMPTZ(3),
    "walk_in_enabled" BOOLEAN NOT NULL DEFAULT false,
    "walk_in_listed" BOOLEAN NOT NULL DEFAULT true,
    "walk_in_group_id" UUID,
    "allowed_ip_range" VARCHAR(1000),
    "enable_anti_cheating" BOOLEAN NOT NULL DEFAULT true,
    "webcam_proctoring_enabled" BOOLEAN NOT NULL DEFAULT true,
    "webcam_ai_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "webcam_record_only" BOOLEAN NOT NULL DEFAULT false,
    "proctoring_enforcement" VARCHAR(1000) NOT NULL DEFAULT 'block',
    "proctoring_strike_limit" INTEGER NOT NULL DEFAULT 3,
    "disabled_proctoring_signals_json" VARCHAR(1000),
    "screen_capture_enabled" BOOLEAN NOT NULL DEFAULT false,
    "lockdown_required" BOOLEAN NOT NULL DEFAULT false,
    "face_verification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "face_enrolment_policy" VARCHAR(1000) NOT NULL DEFAULT 'retry_then_allow',
    "face_mismatch_action" VARCHAR(1000) NOT NULL DEFAULT 'flag',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sections" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "order_index" INTEGER NOT NULL,
    "selection_mode" VARCHAR(1000) NOT NULL DEFAULT 'fixed',
    "pool_size" INTEGER,
    "pool_difficulty" VARCHAR(1000),
    "target_duration_minutes" INTEGER,
    "weight_percent" INTEGER NOT NULL,
    "required_count" INTEGER,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_section_questions" (
    "section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "exam_section_questions_pkey" PRIMARY KEY ("section_id","question_id")
);

-- CreateTable
CREATE TABLE "exam_section_pool_tags" (
    "section_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "exam_section_pool_tags_pkey" PRIMARY KEY ("section_id","tag_id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "phone" VARCHAR(1000),
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "global_stage" VARCHAR(1000) NOT NULL DEFAULT 'new',
    "portal_token" VARCHAR(1000),
    "unsubscribe_token" VARCHAR(1000),
    "email_opted_out_at" TIMESTAMPTZ(3),
    "whatsapp_opted_out_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erased_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_user_id" UUID,
    "consented_at" TIMESTAMPTZ(3),
    "consent_version" INTEGER,
    "sms_opted_out_at" TIMESTAMPTZ(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "resume_path" VARCHAR(1000),
    "parse_status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "parsed_summary" VARCHAR(1000),
    "parsed_skills" VARCHAR(1000),
    "parsed_title" VARCHAR(1000),
    "parsed_years_experience" INTEGER,
    "parsed_at" TIMESTAMPTZ(3),
    "embedding_json" VARCHAR(1000),
    "embedding_model" VARCHAR(1000),
    "embedding_hash" VARCHAR(1000),
    "embedded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "token" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'invited',
    "source" VARCHAR(1000) NOT NULL DEFAULT 'invited',
    "email_status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "advanced_from_exam_id" UUID,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "extra_time_percent" INTEGER NOT NULL DEFAULT 0,
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "active_session_family_id" VARCHAR(1000),
    "drive_session_id" UUID,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "channel" VARCHAR(1000) NOT NULL DEFAULT 'email',
    "status" VARCHAR(1000) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" VARCHAR(1000) NOT NULL,
    "entity_type" VARCHAR(1000) NOT NULL,
    "entity_id" UUID NOT NULL,
    "context_text" VARCHAR(500),
    "link_path" VARCHAR(1000) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "email_enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'in_progress',
    "question_order_json" VARCHAR(1000) NOT NULL,
    "section_snapshot_json" VARCHAR(1000) NOT NULL,
    "option_order_json" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "device_fingerprint" VARCHAR(1000),
    "last_seen_at" TIMESTAMPTZ(3),
    "webcam_violation_count" INTEGER NOT NULL DEFAULT 0,
    "browser_activity_violation_count" INTEGER NOT NULL DEFAULT 0,
    "screen_capture_count" INTEGER NOT NULL DEFAULT 0,
    "paused_at" TIMESTAMPTZ(3),
    "paused_reason" VARCHAR(50),
    "paused_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "consent_at" TIMESTAMPTZ(3),
    "screen_share_started_at" TIMESTAMPTZ(3),
    "proctoring_bypassed_at" TIMESTAMPTZ(3),
    "proctoring_bypassed_by" UUID,
    "proctoring_bypass_reason" VARCHAR(1000),
    "proctoring_bypass_revoked_at" TIMESTAMPTZ(3),
    "face_mismatch_count" INTEGER NOT NULL DEFAULT 0,
    "face_warning_at" TIMESTAMPTZ(3),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_ids_json" VARCHAR(1000) NOT NULL,
    "is_marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_correct" BOOLEAN,
    "marks_awarded" INTEGER,
    "answer_text" VARCHAR(1000),
    "answer_files_json" VARCHAR(1000),
    "grading_feedback" VARCHAR(1000),
    "code_language" VARCHAR(1000),
    "telemetry_json" VARCHAR(1000),

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_answer_reviews" (
    "id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "suggested_marks" INTEGER,
    "summary" VARCHAR(1000),
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_answer_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "pass_fail" VARCHAR(1000),
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "release_override" VARCHAR(1000),
    "released_at" TIMESTAMPTZ(3),
    "certificate_path" VARCHAR(1000),

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_refresh_tokens" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "token_hash" VARCHAR(1000) NOT NULL,
    "family_id" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctoring_events" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "event_type" VARCHAR(1000) NOT NULL,
    "severity" VARCHAR(1000) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" VARCHAR(1000),

    CONSTRAINT "proctoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_enrolments" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "embedding" VARCHAR(1000),
    "reference_image_path" VARCHAR(1000),
    "quality_json" VARCHAR(1000),
    "consent_at" TIMESTAMPTZ(3),
    "captured_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_messages" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "sent_by_user_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "candidate_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctoring_analyses" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "risk_level" VARCHAR(1000),
    "summary" VARCHAR(1000),
    "analyzed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_analyses" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "level" VARCHAR(1000),
    "flags_json" VARCHAR(1000),
    "narrative" VARCHAR(1000),
    "analyzed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "input_json" VARCHAR(1000) NOT NULL,
    "output_json" VARCHAR(1000),
    "error" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_insights" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "summary" VARCHAR(1000),
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_usage" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(1000) NOT NULL,
    "credits" INTEGER NOT NULL,
    "source_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "description" VARCHAR(1000),
    "status" VARCHAR(1000) NOT NULL DEFAULT 'open',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "public_apply_enabled" BOOLEAN NOT NULL DEFAULT false,
    "list_on_careers" BOOLEAN NOT NULL DEFAULT false,
    "apply_token" VARCHAR(1000),
    "location" VARCHAR(200),
    "employment_type" VARCHAR(50),
    "fit_criteria" VARCHAR(1000),
    "fit_rubric" VARCHAR(1000),
    "department" VARCHAR(200),
    "hiring_manager_id" UUID,
    "headcount" INTEGER,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" VARCHAR(10),
    "pipeline_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_user_id" UUID,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_user_id" UUID,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "position" INTEGER NOT NULL,
    "rules_json" VARCHAR(1000),

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_statuses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "pipeline_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejected_reason" VARCHAR(1000),
    "rejected_at" TIMESTAMPTZ(3),
    "entered_via" VARCHAR(1000) NOT NULL,
    "application_token" VARCHAR(1000),
    "assigned_user_id" UUID,
    "assigned_group_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "status_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "blueprint_checklist_json" VARCHAR(1000),
    "referrer_user_id" UUID,

    CONSTRAINT "pipeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "referrer_user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "note" VARCHAR(1000),
    "reward_status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "reward_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger_stage" VARCHAR(1000),
    "questions_json" VARCHAR(1000) NOT NULL DEFAULT '[]',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "survey_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "token" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "answers_json" VARCHAR(1000),
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_fit_assessments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "overall_score" INTEGER,
    "summary" VARCHAR(1000),
    "strengths" VARCHAR(1000),
    "concerns" VARCHAR(1000),
    "dimension_scores" VARCHAR(1000),
    "criteria_hash" VARCHAR(1000),
    "model_used" VARCHAR(1000),
    "scored_by_user_id" UUID,
    "scored_at" TIMESTAMPTZ(3),
    "ai_job_id" UUID,
    "error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_fit_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_feedback" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "note" VARCHAR(1000),
    "rating" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "field_type" VARCHAR(20) NOT NULL,
    "options_json" VARCHAR(1000),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "show_on_apply" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "value_text" VARCHAR(1000),
    "value_number" DOUBLE PRECISION,
    "value_date" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_email_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "trigger_stage_id" UUID,
    "trigger_mode" VARCHAR(1000) NOT NULL,
    "subject" VARCHAR(1000) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_emails" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "pipeline_entry_id" UUID,
    "template_id" UUID,
    "to_email" VARCHAR(1000) NOT NULL,
    "subject" VARCHAR(1000) NOT NULL,
    "rendered_body" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(1000) NOT NULL,
    "sent_by_user_id" UUID,
    "error_detail" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_email_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "subject" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_email_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drip_campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "target_global_stage" VARCHAR(1000),
    "steps_json" VARCHAR(1000) NOT NULL DEFAULT '[]',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drip_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drip_enrolments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "current_step_index" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'active',
    "next_step_due_at" TIMESTAMPTZ(3) NOT NULL,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMPTZ(3),
    "exit_reason" VARCHAR(1000),

    CONSTRAINT "drip_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body_text" VARCHAR(1000) NOT NULL,
    "signatory_name" VARCHAR(200),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_sms_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "trigger_stage_id" UUID,
    "trigger_mode" VARCHAR(1000) NOT NULL DEFAULT 'manual',
    "body" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_whatsapp_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "trigger_stage_id" UUID,
    "trigger_mode" VARCHAR(1000) NOT NULL DEFAULT 'manual',
    "body" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_sms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "pipeline_entry_id" UUID,
    "template_id" UUID,
    "to_phone" VARCHAR(1000) NOT NULL,
    "rendered_body" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(1000) NOT NULL,
    "sent_by_user_id" UUID,
    "error_detail" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_sms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_whatsapp" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "pipeline_entry_id" UUID,
    "template_id" UUID,
    "to_phone" VARCHAR(1000) NOT NULL,
    "rendered_body" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(1000) NOT NULL,
    "sent_by_user_id" UUID,
    "error_detail" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_entry_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "compensation" VARCHAR(1000) NOT NULL,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'draft',
    "offer_token" VARCHAR(1000),
    "pdf_path" VARCHAR(1000),
    "letter_subject" VARCHAR(1000) NOT NULL,
    "letter_body" VARCHAR(1000) NOT NULL,
    "sent_by_user_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_chains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "gate" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_chain_steps" (
    "id" UUID NOT NULL,
    "chain_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "approver_type" VARCHAR(1000) NOT NULL,
    "approver_user_ids" VARCHAR(1000),
    "group_id" UUID,
    "manager_level" INTEGER,

    CONSTRAINT "approval_chain_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "gate" VARCHAR(1000) NOT NULL,
    "subject_type" VARCHAR(1000) NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending_approval',
    "current_step_position" INTEGER NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "chain_snapshot_json" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_position" INTEGER NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "decision" VARCHAR(1000) NOT NULL,
    "note" VARCHAR(1000),
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_entry_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'proposed',
    "interview_token" VARCHAR(1000),
    "location" VARCHAR(1000) NOT NULL,
    "time_zone" VARCHAR(1000) NOT NULL,
    "recruiter_note" VARCHAR(1000),
    "confirmed_slot_id" UUID,
    "candidate_resched_note" VARCHAR(1000),
    "sent_by_user_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "booking_mode" VARCHAR(1000) NOT NULL DEFAULT 'proposed',
    "booking_window_start" TIMESTAMPTZ(3),
    "booking_window_end" TIMESTAMPTZ(3),
    "slot_duration_minutes" INTEGER,
    "external_event_provider" VARCHAR(1000),
    "external_event_id" VARCHAR(1000),
    "external_event_owner_id" UUID,
    "meeting_url" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_slots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_panelists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "interview_panelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(1000) NOT NULL,
    "connected_email" VARCHAR(1000),
    "access_token_encrypted" VARCHAR(1000) NOT NULL,
    "refresh_token_encrypted" VARCHAR(1000) NOT NULL,
    "token_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "scope" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" VARCHAR(1000) NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL DEFAULT 'Default offer letter',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "subject" VARCHAR(1000) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offer_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_exams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(1000) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(1000) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_sender_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "address" VARCHAR(320) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_sender_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_daily" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "endpoint" VARCHAR(1000) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "throttled_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "permissions_json" VARCHAR(1000) NOT NULL,
    "field_permissions_json" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role" VARCHAR(1000) NOT NULL,
    "permissions_json" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_boards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "feed_token" VARCHAR(1000) NOT NULL,
    "provider" VARCHAR(1000) NOT NULL DEFAULT 'xml_feed',
    "config_encrypted" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_board_publications" (
    "job_board_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "external_post_id" VARCHAR(1000),
    "post_status" VARCHAR(1000),
    "post_error" VARCHAR(1000),
    "posted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_board_publications_pkey" PRIMARY KEY ("job_board_id","job_id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_email" VARCHAR(1000),
    "portal_token" VARCHAR(1000) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_jobs" (
    "agency_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_jobs_pkey" PRIMARY KEY ("agency_id","job_id")
);

-- CreateTable
CREATE TABLE "agency_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_name" VARCHAR(1000) NOT NULL,
    "candidate_email" VARCHAR(1000) NOT NULL,
    "candidate_phone" VARCHAR(1000),
    "resume_path" VARCHAR(1000) NOT NULL,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(1000) NOT NULL DEFAULT 'pending',
    "candidate_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "billing_notices_organization_id_idx" ON "billing_notices"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_notices_organization_id_dimension_threshold_period__key" ON "billing_notices"("organization_id", "dimension", "threshold", "period_start");

-- CreateIndex
CREATE INDEX "hris_export_deliveries_organization_id_created_at_idx" ON "hris_export_deliveries"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organization_id_created_at_idx" ON "webhook_deliveries"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sso_login_codes_code_hash_key" ON "sso_login_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "setup_tokens_token_hash_key" ON "setup_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs"("entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "system_events_organization_id_occurred_at_idx" ON "system_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "system_events_occurred_at_idx" ON "system_events"("occurred_at");

-- CreateIndex
CREATE INDEX "system_events_service_idx" ON "system_events"("service");

-- CreateIndex
CREATE INDEX "questions_organization_id_topic_difficulty_idx" ON "questions"("organization_id", "topic", "difficulty");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");

-- CreateIndex
CREATE INDEX "walk_in_groups_job_id_idx" ON "walk_in_groups"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "walk_in_groups_organization_id_name_key" ON "walk_in_groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "drive_sessions_walk_in_group_id_idx" ON "drive_sessions"("walk_in_group_id");

-- CreateIndex
CREATE INDEX "exams_organization_id_status_idx" ON "exams"("organization_id", "status");

-- CreateIndex
CREATE INDEX "exam_sections_exam_id_idx" ON "exam_sections"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_portal_token_key" ON "candidates"("portal_token");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_unsubscribe_token_key" ON "candidates"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "candidates_organization_id_global_stage_idx" ON "candidates"("organization_id", "global_stage");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_organization_id_email_key" ON "candidates"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_candidate_id_key" ON "candidate_profiles"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_exam_id_status_idx" ON "invitations"("exam_id", "status");

-- CreateIndex
CREATE INDEX "notifications_invitation_id_idx" ON "notifications"("invitation_id");

-- CreateIndex
CREATE INDEX "user_notifications_recipient_user_id_read_at_idx" ON "user_notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE INDEX "user_notification_preferences_organization_id_idx" ON "user_notification_preferences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_user_id_type_key" ON "user_notification_preferences"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_invitation_id_key" ON "attempts"("invitation_id");

-- CreateIndex
CREATE INDEX "attempts_exam_id_status_idx" ON "attempts"("exam_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_id_question_id_key" ON "answers"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "code_answer_reviews_answer_id_key" ON "code_answer_reviews"("answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_attempt_id_key" ON "results"("attempt_id");

-- CreateIndex
CREATE INDEX "candidate_refresh_tokens_invitation_id_idx" ON "candidate_refresh_tokens"("invitation_id");

-- CreateIndex
CREATE INDEX "proctoring_events_attempt_id_occurred_at_idx" ON "proctoring_events"("attempt_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "face_enrolments_attempt_id_key" ON "face_enrolments"("attempt_id");

-- CreateIndex
CREATE INDEX "candidate_messages_attempt_id_sent_at_idx" ON "candidate_messages"("attempt_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "proctoring_analyses_attempt_id_key" ON "proctoring_analyses"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrity_analyses_attempt_id_key" ON "integrity_analyses"("attempt_id");

-- CreateIndex
CREATE INDEX "ai_jobs_organization_id_status_idx" ON "ai_jobs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_insights_attempt_id_key" ON "attempt_insights"("attempt_id");

-- CreateIndex
CREATE INDEX "ai_credit_usage_organization_id_idx" ON "ai_credit_usage"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_apply_token_key" ON "jobs"("apply_token");

-- CreateIndex
CREATE INDEX "jobs_organization_id_status_idx" ON "jobs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "pipelines_organization_id_idx" ON "pipelines"("organization_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "pipeline_stages"("pipeline_id");

-- CreateIndex
CREATE INDEX "pipeline_statuses_stage_id_idx" ON "pipeline_statuses"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_entries_application_token_key" ON "pipeline_entries"("application_token");

-- CreateIndex
CREATE INDEX "pipeline_entries_job_id_idx" ON "pipeline_entries"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_entries_job_id_candidate_id_key" ON "pipeline_entries"("job_id", "candidate_id");

-- CreateIndex
CREATE INDEX "referrals_organization_id_referrer_user_id_idx" ON "referrals"("organization_id", "referrer_user_id");

-- CreateIndex
CREATE INDEX "referrals_organization_id_created_at_idx" ON "referrals"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_entry_id_key" ON "referrals"("entry_id");

-- CreateIndex
CREATE INDEX "survey_definitions_organization_id_idx" ON "survey_definitions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_token_key" ON "survey_responses"("token");

-- CreateIndex
CREATE INDEX "survey_responses_organization_id_survey_id_idx" ON "survey_responses"("organization_id", "survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_survey_id_entry_id_key" ON "survey_responses"("survey_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_fit_assessments_entry_id_key" ON "candidate_fit_assessments"("entry_id");

-- CreateIndex
CREATE INDEX "candidate_fit_assessments_organization_id_job_id_idx" ON "candidate_fit_assessments"("organization_id", "job_id");

-- CreateIndex
CREATE INDEX "pipeline_feedback_entry_id_idx" ON "pipeline_feedback"("entry_id");

-- CreateIndex
CREATE INDEX "custom_field_definitions_organization_id_entity_type_idx" ON "custom_field_definitions"("organization_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_organization_id_entity_type_key_key" ON "custom_field_definitions"("organization_id", "entity_type", "key");

-- CreateIndex
CREATE INDEX "custom_field_values_organization_id_entity_type_entity_id_idx" ON "custom_field_values"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_organization_id_definition_id_entity_id_key" ON "custom_field_values"("organization_id", "definition_id", "entity_id");

-- CreateIndex
CREATE INDEX "candidate_email_templates_organization_id_idx" ON "candidate_email_templates"("organization_id");

-- CreateIndex
CREATE INDEX "candidate_emails_organization_id_candidate_id_idx" ON "candidate_emails"("organization_id", "candidate_id");

-- CreateIndex
CREATE INDEX "candidate_emails_pipeline_entry_id_idx" ON "candidate_emails"("pipeline_entry_id");

-- CreateIndex
CREATE INDEX "candidate_email_batches_organization_id_created_at_idx" ON "candidate_email_batches"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "drip_campaigns_organization_id_idx" ON "drip_campaigns"("organization_id");

-- CreateIndex
CREATE INDEX "drip_enrolments_organization_id_status_next_step_due_at_idx" ON "drip_enrolments"("organization_id", "status", "next_step_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "drip_enrolments_campaign_id_candidate_id_key" ON "drip_enrolments"("campaign_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_organization_id_key" ON "certificate_templates"("organization_id");

-- CreateIndex
CREATE INDEX "candidate_sms_templates_organization_id_idx" ON "candidate_sms_templates"("organization_id");

-- CreateIndex
CREATE INDEX "candidate_whatsapp_templates_organization_id_idx" ON "candidate_whatsapp_templates"("organization_id");

-- CreateIndex
CREATE INDEX "candidate_sms_organization_id_candidate_id_idx" ON "candidate_sms"("organization_id", "candidate_id");

-- CreateIndex
CREATE INDEX "candidate_sms_pipeline_entry_id_idx" ON "candidate_sms"("pipeline_entry_id");

-- CreateIndex
CREATE INDEX "candidate_whatsapp_organization_id_candidate_id_idx" ON "candidate_whatsapp"("organization_id", "candidate_id");

-- CreateIndex
CREATE INDEX "candidate_whatsapp_pipeline_entry_id_idx" ON "candidate_whatsapp"("pipeline_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_offer_token_key" ON "offers"("offer_token");

-- CreateIndex
CREATE INDEX "offers_organization_id_pipeline_entry_id_idx" ON "offers"("organization_id", "pipeline_entry_id");

-- CreateIndex
CREATE INDEX "offers_organization_id_candidate_id_idx" ON "offers"("organization_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_chains_organization_id_gate_key" ON "approval_chains"("organization_id", "gate");

-- CreateIndex
CREATE INDEX "approval_chain_steps_chain_id_idx" ON "approval_chain_steps"("chain_id");

-- CreateIndex
CREATE INDEX "approval_requests_organization_id_status_idx" ON "approval_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_subject_type_subject_id_idx" ON "approval_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "approval_decisions_request_id_idx" ON "approval_decisions"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_interview_token_key" ON "interviews"("interview_token");

-- CreateIndex
CREATE INDEX "interviews_organization_id_pipeline_entry_id_idx" ON "interviews"("organization_id", "pipeline_entry_id");

-- CreateIndex
CREATE INDEX "interviews_organization_id_candidate_id_idx" ON "interviews"("organization_id", "candidate_id");

-- CreateIndex
CREATE INDEX "interview_slots_interview_id_idx" ON "interview_slots"("interview_id");

-- CreateIndex
CREATE INDEX "interview_panelists_organization_id_user_id_idx" ON "interview_panelists"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_panelists_interview_id_user_id_key" ON "interview_panelists"("interview_id", "user_id");

-- CreateIndex
CREATE INDEX "calendar_connections_organization_id_user_id_idx" ON "calendar_connections"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_user_id_provider_key" ON "calendar_connections"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_oauth_states_state_hash_key" ON "calendar_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "offer_templates_organization_id_idx" ON "offer_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_templates_organization_id_name_key" ON "offer_templates"("organization_id", "name");

-- CreateIndex
CREATE INDEX "job_exams_exam_id_idx" ON "job_exams"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_exams_job_id_exam_id_key" ON "job_exams"("job_id", "exam_id");

-- CreateIndex
CREATE INDEX "approval_email_templates_organization_id_idx" ON "approval_email_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_email_templates_organization_id_event_type_key" ON "approval_email_templates"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "interview_email_templates_organization_id_idx" ON "interview_email_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_email_templates_organization_id_event_type_key" ON "interview_email_templates"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "user_groups_organization_id_idx" ON "user_groups"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_groups_organization_id_name_key" ON "user_groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "user_group_members_organization_id_user_id_idx" ON "user_group_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_group_members_group_id_user_id_key" ON "user_group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "org_sender_addresses_organization_id_idx" ON "org_sender_addresses"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_sender_addresses_organization_id_address_key" ON "org_sender_addresses"("organization_id", "address");

-- CreateIndex
CREATE INDEX "api_usage_daily_organization_id_day_idx" ON "api_usage_daily"("organization_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_daily_organization_id_day_endpoint_key" ON "api_usage_daily"("organization_id", "day", "endpoint");

-- CreateIndex
CREATE INDEX "permission_profiles_organization_id_idx" ON "permission_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_profiles_organization_id_name_key" ON "permission_profiles"("organization_id", "name");

-- CreateIndex
CREATE INDEX "org_role_permissions_organization_id_idx" ON "org_role_permissions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_role_permissions_organization_id_role_key" ON "org_role_permissions"("organization_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "job_boards_feed_token_key" ON "job_boards"("feed_token");

-- CreateIndex
CREATE INDEX "job_boards_organization_id_idx" ON "job_boards"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_boards_organization_id_name_key" ON "job_boards"("organization_id", "name");

-- CreateIndex
CREATE INDEX "job_board_publications_job_id_idx" ON "job_board_publications"("job_id");

-- CreateIndex
CREATE INDEX "job_board_publications_organization_id_idx" ON "job_board_publications"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_portal_token_key" ON "agencies"("portal_token");

-- CreateIndex
CREATE INDEX "agencies_organization_id_idx" ON "agencies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_organization_id_name_key" ON "agencies"("organization_id", "name");

-- CreateIndex
CREATE INDEX "agency_jobs_job_id_idx" ON "agency_jobs"("job_id");

-- CreateIndex
CREATE INDEX "agency_jobs_organization_id_idx" ON "agency_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "agency_submissions_organization_id_status_idx" ON "agency_submissions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "agency_submissions_agency_id_idx" ON "agency_submissions"("agency_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_codes" ADD CONSTRAINT "sso_login_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_permission_profile_id_fkey" FOREIGN KEY ("permission_profile_id") REFERENCES "permission_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_ai_job_id_fkey" FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_in_groups" ADD CONSTRAINT "walk_in_groups_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "drive_sessions" ADD CONSTRAINT "drive_sessions_walk_in_group_id_fkey" FOREIGN KEY ("walk_in_group_id") REFERENCES "walk_in_groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_walk_in_group_id_fkey" FOREIGN KEY ("walk_in_group_id") REFERENCES "walk_in_groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_section_questions" ADD CONSTRAINT "exam_section_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_section_questions" ADD CONSTRAINT "exam_section_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_section_pool_tags" ADD CONSTRAINT "exam_section_pool_tags_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_section_pool_tags" ADD CONSTRAINT "exam_section_pool_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_drive_session_id_fkey" FOREIGN KEY ("drive_session_id") REFERENCES "drive_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_answer_reviews" ADD CONSTRAINT "code_answer_reviews_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_refresh_tokens" ADD CONSTRAINT "candidate_refresh_tokens_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_enrolments" ADD CONSTRAINT "face_enrolments_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctoring_analyses" ADD CONSTRAINT "proctoring_analyses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_analyses" ADD CONSTRAINT "integrity_analyses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_insights" ADD CONSTRAINT "attempt_insights_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pipeline_statuses" ADD CONSTRAINT "pipeline_statuses_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "pipeline_statuses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_fit_assessments" ADD CONSTRAINT "candidate_fit_assessments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_emails" ADD CONSTRAINT "candidate_emails_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_emails" ADD CONSTRAINT "candidate_emails_pipeline_entry_id_fkey" FOREIGN KEY ("pipeline_entry_id") REFERENCES "pipeline_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_emails" ADD CONSTRAINT "candidate_emails_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_email_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_sms" ADD CONSTRAINT "candidate_sms_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_whatsapp" ADD CONSTRAINT "candidate_whatsapp_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_pipeline_entry_id_fkey" FOREIGN KEY ("pipeline_entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approval_chain_steps" ADD CONSTRAINT "approval_chain_steps_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "approval_chains"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_pipeline_entry_id_fkey" FOREIGN KEY ("pipeline_entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "job_exams" ADD CONSTRAINT "job_exams_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "job_exams" ADD CONSTRAINT "job_exams_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "job_board_publications" ADD CONSTRAINT "job_board_publications_job_board_id_fkey" FOREIGN KEY ("job_board_id") REFERENCES "job_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_board_publications" ADD CONSTRAINT "job_board_publications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_jobs" ADD CONSTRAINT "agency_jobs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agency_jobs" ADD CONSTRAINT "agency_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


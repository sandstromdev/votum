CREATE TYPE "meeting_lifecycle" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "incomplete_resolution_type" AS ENUM('accept', 'vacancy');--> statement-breakpoint
CREATE TYPE "majority_rule" AS ENUM('simple', 'qualified');--> statement-breakpoint
CREATE TYPE "selection_vote_mode" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "vote_kind" AS ENUM('decision', 'selection');--> statement-breakpoint
CREATE TYPE "vote_lifecycle" AS ENUM('draft', 'open', 'closed', 'invalidated');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organizer_user_id" text NOT NULL,
	"public_locator" text NOT NULL,
	"title" text NOT NULL,
	"lifecycle" "meeting_lifecycle" DEFAULT 'draft'::"meeting_lifecycle" NOT NULL,
	"expected_participant_count" integer,
	"presentation_qr_enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"opened_at" timestamp,
	"closed_at" timestamp,
	CONSTRAINT "meeting_lifecycle_chk" CHECK ((
				("lifecycle" = 'draft' AND "opened_at" IS NULL AND "closed_at" IS NULL)
				OR ("lifecycle" = 'open' AND "opened_at" IS NOT NULL AND "closed_at" IS NULL)
				OR ("lifecycle" = 'closed' AND "opened_at" IS NOT NULL AND "closed_at" IS NOT NULL)
			)),
	CONSTRAINT "meeting_revision_nonnegative_chk" CHECK ("revision" >= 0),
	CONSTRAINT "meeting_expected_participant_count_chk" CHECK ("expected_participant_count" IS NULL OR "expected_participant_count" > 0),
	CONSTRAINT "meeting_public_locator_present_chk" CHECK (char_length("public_locator") > 0),
	CONSTRAINT "meeting_title_present_chk" CHECK (char_length("title") > 0)
);
--> statement-breakpoint
CREATE TABLE "outcome_resolution" (
	"vote_id" uuid PRIMARY KEY,
	"meeting_id" uuid NOT NULL,
	"type" "incomplete_resolution_type" NOT NULL,
	"resolved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_snapshot" (
	"vote_id" uuid PRIMARY KEY,
	"meeting_id" uuid NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"meeting_id" uuid NOT NULL,
	"vote_id" uuid NOT NULL,
	"participant_token_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_token" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"meeting_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_token_anomaly" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"meeting_id" uuid,
	"vote_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_vote_config" (
	"vote_id" uuid PRIMARY KEY,
	"support_label" text NOT NULL,
	"oppose_label" text NOT NULL,
	"abstention_label" text NOT NULL,
	"majority_rule" "majority_rule" DEFAULT 'simple'::"majority_rule" NOT NULL,
	"abstentions_counted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "decision_support_label_present_chk" CHECK (char_length("support_label") > 0),
	CONSTRAINT "decision_oppose_label_present_chk" CHECK (char_length("oppose_label") > 0),
	CONSTRAINT "decision_abstention_label_present_chk" CHECK (char_length("abstention_label") > 0),
	CONSTRAINT "decision_abstentions_only_qualified_chk" CHECK ("majority_rule" = 'qualified' OR "abstentions_counted" = false)
);
--> statement-breakpoint
CREATE TABLE "selection_option" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"vote_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "selection_option_position_nonnegative_chk" CHECK ("position" >= 0),
	CONSTRAINT "selection_option_label_present_chk" CHECK (char_length("label") > 0)
);
--> statement-breakpoint
CREATE TABLE "selection_vote_config" (
	"vote_id" uuid PRIMARY KEY,
	"mode" "selection_vote_mode" NOT NULL,
	"position_count" integer NOT NULL,
	"vacancy_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "selection_position_count_positive_chk" CHECK ("position_count" > 0),
	CONSTRAINT "selection_single_winner_one_position_chk" CHECK ("mode" <> 'single' OR "position_count" = 1)
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"meeting_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"kind" "vote_kind" NOT NULL,
	"lifecycle" "vote_lifecycle" DEFAULT 'draft'::"vote_lifecycle" NOT NULL,
	"rerun_of_vote_id" uuid,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"revealed" boolean DEFAULT false NOT NULL,
	"revealed_at" timestamp,
	"public_result_breakdown_enabled" boolean DEFAULT false NOT NULL,
	"invalidation_reason" text,
	"invalidated_by_user_id" text,
	"invalidated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vote_id_meeting_id_uidx" UNIQUE("id","meeting_id"),
	CONSTRAINT "vote_position_nonnegative_chk" CHECK ("position" >= 0),
	CONSTRAINT "vote_title_present_chk" CHECK (char_length("title") > 0),
	CONSTRAINT "vote_no_self_rerun_chk" CHECK ("rerun_of_vote_id" IS NULL OR "rerun_of_vote_id" <> "id"),
	CONSTRAINT "vote_lifecycle_chk" CHECK ((
				(
					"lifecycle" = 'draft'
					AND "opened_at" IS NULL
					AND "closed_at" IS NULL
					AND "invalidated_at" IS NULL
					AND "revealed" = false
					AND "revealed_at" IS NULL
				)
				OR (
					"lifecycle" = 'open'
					AND "opened_at" IS NOT NULL
					AND "closed_at" IS NULL
					AND "invalidated_at" IS NULL
					AND "revealed" = false
					AND "revealed_at" IS NULL
				)
				OR (
					"lifecycle" = 'closed'
					AND "opened_at" IS NOT NULL
					AND "closed_at" IS NOT NULL
					AND "invalidated_at" IS NULL
					AND (
						("revealed" = false AND "revealed_at" IS NULL)
						OR ("revealed" = true AND "revealed_at" IS NOT NULL)
					)
				)
				OR (
					"lifecycle" = 'invalidated'
					AND "opened_at" IS NOT NULL
					AND "invalidated_at" IS NOT NULL
					AND "revealed" = false
					AND "revealed_at" IS NULL
					AND "invalidation_reason" IS NOT NULL
					AND "invalidated_by_user_id" IS NOT NULL
				)
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_public_locator_uidx" ON "meeting" ("public_locator");--> statement-breakpoint
CREATE UNIQUE INDEX "ballot_vote_participant_token_uidx" ON "ballot" ("vote_id","participant_token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_token_hash_uidx" ON "participant_token" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_token_id_meeting_id_uidx" ON "participant_token" ("id","meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_token_anomaly_meeting_vote_name_uidx" ON "participant_token_anomaly" ("meeting_id","vote_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "selection_option_vote_position_uidx" ON "selection_option" ("vote_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_meeting_position_uidx" ON "vote" ("meeting_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_one_open_per_meeting_uidx" ON "vote" ("meeting_id") WHERE "lifecycle" = 'open';--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_organizer_user_id_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "outcome_resolution" ADD CONSTRAINT "outcome_resolution_vote_id_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "outcome_resolution" ADD CONSTRAINT "outcome_resolution_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "outcome_resolution" ADD CONSTRAINT "outcome_resolution_vote_meeting_fk" FOREIGN KEY ("vote_id","meeting_id") REFERENCES "vote"("id","meeting_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "outcome_snapshot" ADD CONSTRAINT "outcome_snapshot_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "outcome_snapshot" ADD CONSTRAINT "outcome_snapshot_vote_meeting_fk" FOREIGN KEY ("vote_id","meeting_id") REFERENCES "vote"("id","meeting_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_vote_meeting_fk" FOREIGN KEY ("vote_id","meeting_id") REFERENCES "vote"("id","meeting_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_participant_token_meeting_fk" FOREIGN KEY ("participant_token_id","meeting_id") REFERENCES "participant_token"("id","meeting_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "participant_token" ADD CONSTRAINT "participant_token_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "participant_token_anomaly" ADD CONSTRAINT "participant_token_anomaly_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "participant_token_anomaly" ADD CONSTRAINT "participant_token_anomaly_vote_id_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "decision_vote_config" ADD CONSTRAINT "decision_vote_config_vote_id_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "selection_option" ADD CONSTRAINT "selection_option_vote_id_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "selection_vote_config" ADD CONSTRAINT "selection_vote_config_vote_id_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_invalidated_by_user_id_user_id_fkey" FOREIGN KEY ("invalidated_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_rerun_of_vote_meeting_fk" FOREIGN KEY ("rerun_of_vote_id","meeting_id") REFERENCES "vote"("id","meeting_id") ON DELETE RESTRICT;--> statement-breakpoint
CREATE OR REPLACE FUNCTION outcome_snapshot_immutable() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'outcome snapshots are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER outcome_snapshot_no_update
	BEFORE UPDATE ON outcome_snapshot
	FOR EACH ROW
	EXECUTE PROCEDURE outcome_snapshot_immutable();--> statement-breakpoint
CREATE TRIGGER outcome_snapshot_no_delete
	BEFORE DELETE ON outcome_snapshot
	FOR EACH ROW
	EXECUTE PROCEDURE outcome_snapshot_immutable();

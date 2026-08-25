ALTER TABLE "participant_token" ADD COLUMN "initial_submission_key_hash" text;--> statement-breakpoint
ALTER TABLE "participant_token" ADD COLUMN "initial_submission_vote_id" uuid;--> statement-breakpoint
ALTER TABLE "participant_token" ADD COLUMN "initial_submission_payload_hash" text;--> statement-breakpoint
ALTER TABLE "participant_token" ADD COLUMN "initial_submission_token_ciphertext" text;--> statement-breakpoint
CREATE UNIQUE INDEX "participant_token_meeting_initial_submission_key_uidx" ON "participant_token" ("meeting_id","initial_submission_key_hash") WHERE "initial_submission_key_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_token" ADD CONSTRAINT "participant_token_initial_submission_vote_id_vote_id_fkey" FOREIGN KEY ("initial_submission_vote_id") REFERENCES "vote"("id") ON DELETE RESTRICT;
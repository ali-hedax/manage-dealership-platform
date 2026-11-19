ALTER TABLE "tasks" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancelled_by" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancel_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancelled_from_status" text;

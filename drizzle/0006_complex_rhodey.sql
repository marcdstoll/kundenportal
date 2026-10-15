CREATE TABLE "job_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"actor_id" text,
	"file_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "job_files" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "job_files" ADD COLUMN "late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "online_folder_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "parent_job_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_requested_by" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "job_comments" ADD CONSTRAINT "job_comments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_comments" ADD CONSTRAINT "job_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_comments_job_idx" ON "job_comments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");
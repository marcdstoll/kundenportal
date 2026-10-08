CREATE TABLE "job_files" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"size" bigint NOT NULL,
	"frameio_file_id" text NOT NULL,
	"frameio_url" text,
	"uploaded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"cutter_id" text,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"video_length" text NOT NULL,
	"content" text NOT NULL,
	"special_notes" text NOT NULL,
	"status" text DEFAULT 'entwurf' NOT NULL,
	"feedback_note" text,
	"frameio_folder_id" text,
	"frameio_folder_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_files" ADD CONSTRAINT "job_files_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cutter_id_user_id_fk" FOREIGN KEY ("cutter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
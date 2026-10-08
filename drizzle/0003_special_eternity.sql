CREATE TABLE "job_cutters" (
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_cutters_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_cutter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "format" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "review_url" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "billed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "job_cutters" ADD CONSTRAINT "job_cutters_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cutters" ADD CONSTRAINT "job_cutters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "cutter_id";
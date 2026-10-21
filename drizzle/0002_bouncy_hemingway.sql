CREATE TABLE "project_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"created_by" text,
	"done_at" timestamp,
	"done_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "project_ideas" ADD CONSTRAINT "project_ideas_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_ideas" ADD CONSTRAINT "project_ideas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_ideas" ADD CONSTRAINT "project_ideas_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_ideas_customer_idx" ON "project_ideas" USING btree ("customer_id");
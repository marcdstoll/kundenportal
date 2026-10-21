-- Projekt-Ideen: neue Tabelle (einmalig in der Produktions-Datenbank ausführen)
CREATE TABLE IF NOT EXISTS "project_ideas" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL,
  "title" text NOT NULL,
  "note" text,
  "created_by" text,
  "done_at" timestamp,
  "done_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_ideas_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE cascade,
  CONSTRAINT "project_ideas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE set null,
  CONSTRAINT "project_ideas_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "user"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "project_ideas_customer_idx" ON "project_ideas" ("customer_id");

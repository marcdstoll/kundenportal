-- Personenfarben + neue Projekt-Ideen (Status, Priorität, Stimmen, Kommentare, Screenshots, Inbox)
-- Einmalig in der Produktions-Datenbank ausführen (Coolify → Postgres → Terminal → psql), BEVOR du pushst.

-- 1. Persönliche Farbe
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "color" text;

-- 2. Projekt-Ideen: Status + Priorität (bisher abgehakte Ideen werden „abgeschlossen“)
ALTER TABLE "project_ideas" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'offen' NOT NULL;
ALTER TABLE "project_ideas" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'mittel' NOT NULL;
UPDATE "project_ideas" SET "status" = 'abgeschlossen' WHERE "done_at" IS NOT NULL AND "status" = 'offen';

CREATE TABLE IF NOT EXISTS "idea_votes" (
  "idea_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "idea_votes_idea_id_user_id_pk" PRIMARY KEY ("idea_id", "user_id"),
  CONSTRAINT "idea_votes_idea_id_project_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "project_ideas"("id") ON DELETE cascade,
  CONSTRAINT "idea_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "idea_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "idea_id" text NOT NULL,
  "author_id" text,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "edited_at" timestamp,
  CONSTRAINT "idea_comments_idea_id_project_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "project_ideas"("id") ON DELETE cascade,
  CONSTRAINT "idea_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "idea_comments_idea_idx" ON "idea_comments" ("idea_id");

CREATE TABLE IF NOT EXISTS "idea_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "idea_id" text NOT NULL,
  "data" text NOT NULL,
  "size" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "idea_attachments_idea_id_project_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "project_ideas"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "idea_attachments_idea_idx" ON "idea_attachments" ("idea_id");

-- 3. Inbox: Meldungen können jetzt auch zu einer Projekt-Idee gehören
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idea_id" text;
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_idea_id_project_ideas_id_fk"
    FOREIGN KEY ("idea_id") REFERENCES "project_ideas"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

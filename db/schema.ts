import { bigint, boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Speichert den Zugang zu Frame.io (nur ein Eintrag mit id "default")
export const frameioConnection = pgTable("frameio_connection", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Ein Projekt eines Clients
// status: entwurf → todo → warteschlange → in_arbeit → feedback → complete → ready_to_post → online
//         (oder storniert)
// format: shortform | longform | clipping
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull(),
  format: text("format").notNull(),
  platform: text("platform").notNull(),
  videoLength: text("video_length").notNull(),
  content: text("content").notNull(),
  specialNotes: text("special_notes").notNull(),
  status: text("status").notNull().default("entwurf"),
  feedbackNote: text("feedback_note"),
  reviewUrl: text("review_url"),
  billed: boolean("billed").notNull().default(false),
  frameioFolderId: text("frameio_folder_id"),
  frameioFolderUrl: text("frameio_folder_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Welche Cutter an einem Projekt arbeiten (mehrere möglich)
export const jobCutters = pgTable(
  "job_cutters",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.userId] })]
);

// Dateien eines Projekts: "roh" vom Client, "fertig" vom Cutter
export const jobFiles = pgTable("job_files", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  frameioFileId: text("frameio_file_id").notNull(),
  frameioUrl: text("frameio_url"),
  uploaded: boolean("uploaded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

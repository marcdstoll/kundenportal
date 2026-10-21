import { bigint, boolean, date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
// status: entwurf → todo → in_arbeit → feedback → ready_to_post → online (oder storniert)
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
  // Abrechnung: billed = Cutter abgerechnet, billedCustomer = Kunde abgerechnet
  billed: boolean("billed").notNull().default(false),
  billedCustomer: boolean("billed_customer").notNull().default(false),
  frameioFolderId: text("frameio_folder_id"),
  frameioFolderUrl: text("frameio_folder_url"),
  // Unterordner in Frame.io: "Raw" (Kundendateien) und "ToBeReviewed" (Cutter-Videos)
  rawFolderId: text("raw_folder_id"),
  reviewFolderId: text("review_folder_id"),
  // Ordner "Online": finale Videos wandern beim Status Online dorthin
  onlineFolderId: text("online_folder_id"),
  // Geplantes oder tatsächliches Veröffentlichungsdatum (für den Kalender)
  publishDate: date("publish_date"),
  // Duplikat ("Teil 2"): verweist auf das ursprüngliche Projekt, teilt dessen Frame.io-Ordner
  parentJobId: text("parent_job_id"),
  // Wann das Projekt abgeschickt wurde – Dateien danach gelten als "nachgereicht"
  submittedAt: timestamp("submitted_at"),
  // Storno-Anfrage des Kunden: solange gesetzt, ist die Arbeit pausiert, bis ein Admin entscheidet
  cancelRequestedAt: timestamp("cancel_requested_at"),
  cancelRequestedBy: text("cancel_requested_by"),
  cancelReason: text("cancel_reason"),
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
  // Wer hochgeladen hat und ob es nach dem Abschicken nachgereicht wurde
  uploadedBy: text("uploaded_by"),
  late: boolean("late").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Kommentare am Projekt (Kunde, Cutter und Admins schreiben im selben Verlauf)
export const jobComments = pgTable(
  "job_comments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // Wird der Verfasser gelöscht (z. B. ein Cutter), bleibt der Kommentar stehen → „Gelöschter Nutzer“
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Zuletzt bearbeitet (nur der Verfasser kann bearbeiten)
    editedAt: timestamp("edited_at"),
  },
  (t) => [index("job_comments_job_idx").on(t.jobId)]
);

// Inbox: eine Benachrichtigung pro Empfänger – gehört entweder zu einem Projekt (jobId) oder einem Feature (featureId)
// type: file | comment | storno_request | storno_decision | status | feature | feature_comment | feature_status
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    featureId: text("feature_id").references(() => featureRequests.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    text: text("text").notNull(),
    actorId: text("actor_id"),
    fileId: text("file_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]
);

// Freigaben: welcher Cutter betreut welche Kunden (sieht nur deren Projekte)
export const cutterClients = pgTable(
  "cutter_clients",
  {
    cutterId: text("cutter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cutterId, t.clientId] })]
);

// Zusatzangaben zu Kunden und Cuttern (Logo, Telefon, Links, Infos für Cutter)
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  phone: text("phone"),
  // Logo als kleines, verkleinertes Bild (data:image/webp;base64,…), max. ca. 100 KB
  logo: text("logo"),
  // Wichtige Links (Instagram, TikTok, Drive …), eine pro Zeile
  links: text("links"),
  // Infos für die betreuenden Cutter (Stil, Do's & Don'ts …)
  notes: text("notes"),
  // Persönliche Video-Begrüßung (Link), wird vor dem Onboarding-Video gezeigt
  welcomeVideo: text("welcome_video"),
  // Geburtsdatum ("YYYY-MM-DD"), optional
  birthday: date("birthday"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Einladungslinks: Admin legt Nutzer an, die Person setzt über den Link ihr Passwort
export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdBy: text("created_by"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Einstellungen als Schlüssel/Wert, z. B. Links zu den Onboarding-Videos
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Projekt-Ideen: Kunden notieren Ideen (Titel + Notiz), Admins/Cutter sehen sie und haken sie ab
export const projectIdeas = pgTable(
  "project_ideas",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at"),
    doneBy: text("done_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("project_ideas_customer_idx").on(t.customerId)]
);

// ---------- Featureboard ----------
// status: offen | in_arbeit | abgeschlossen (setzen nur Admins); completedAt wird beim Abschließen gesetzt
export const featureRequests = pgTable("feature_requests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("offen"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Eine Stimme pro Person und Feature
export const featureVotes = pgTable(
  "feature_votes",
  {
    featureId: text("feature_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.featureId, t.userId] })]
);

// Kommentare: schreiben dürfen nur der Ersteller des Features und Admins
export const featureComments = pgTable(
  "feature_comments",
  {
    id: text("id").primaryKey(),
    featureId: text("feature_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [index("feature_comments_feature_idx").on(t.featureId)]
);

// Screenshots (im Browser verkleinert, als data-URL gespeichert, max. 5 pro Feature)
export const featureAttachments = pgTable(
  "feature_attachments",
  {
    id: text("id").primaryKey(),
    featureId: text("feature_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    data: text("data").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("feature_attachments_feature_idx").on(t.featureId)]
);

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
// ---------- Kunden ----------
// Ein Kunde ist eine Firma/Marke mit einem oder mehreren Nutzern (customer_members).
// Übernommene Altkunden haben dieselbe ID wie ihr erster Nutzer.
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Logo (klein, rund) und Titelbild (Galerie/Detailansicht) als data-URL, im Browser verkleinert
  logo: text("logo"),
  cover: text("cover"),
  // Banner der Kunden-Übersicht (breit, data-URL) und senkrechte Bildposition in Prozent (0 = oben, 100 = unten)
  banner: text("banner"),
  bannerPos: integer("banner_pos").notNull().default(50),
  // Alte Link-Liste (eine pro Zeile) – wird nur noch gelesen, solange link_list leer ist
  links: text("links"),
  // Links als JSON: { tiktok, youtube, instagram, extra: [{ label, url }] }
  linkList: text("link_list"),
  // Infos für die Cutter (Stil, Do's & Don'ts, Ansprechpartner …)
  notes: text("notes"),
  // Farbe des Kunden ("#rrggbb") für Board und Kalender
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Nutzer eines Kunden; isAdmin = darf weitere Nutzer einladen und Admins ernennen
export const customerMembers = pgTable(
  "customer_members",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("customer_members_customer_idx").on(t.customerId)],
);

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  // Kunde (Firma) – siehe customers; bei übernommenen Altkunden gleich der ID ihres ersten Nutzers
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
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
  // Für welchen Termin/Status schon an die Deadline erinnert wurde ("2026-11-02|in_arbeit")
  deadlineNotice: text("deadline_notice"),
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
  (t) => [primaryKey({ columns: [t.jobId, t.userId] })],
);

// Veröffentlichungen eines fertigen Videos (Hall of Fame): je Plattform ein Link mit dem letzten Views-Stand.
// Ein Video zählt einmal – seine Views sind die Summe aller Plattformen.
export const publications = pgTable(
  "publications",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // "youtube" | "tiktok" | "instagram"
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    // YouTube-Video-ID, TikTok-Video-ID bzw. Instagram-Kurzcode (aus dem Link gelesen)
    externalId: text("external_id"),
    // Letzter bekannter Stand – wird bei Fehlern nie überschrieben oder auf 0 gesetzt
    views: bigint("views", { mode: "number" }),
    viewsAt: timestamp("views_at"),
    // Letzter Abrufversuch und ggf. dessen Fehler (z. B. „Video nicht gefunden“)
    checkedAt: timestamp("checked_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("publications_job_platform").on(t.jobId, t.platform)],
);

// Tagesstände je Veröffentlichung (Verlauf; ein Eintrag pro Tag, Wiener Zeit)
export const publicationViews = pgTable(
  "publication_views",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.day] })],
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
  (t) => [index("job_comments_job_idx").on(t.jobId)],
);

// Inbox: eine Benachrichtigung pro Empfänger – gehört zu einem Projekt (jobId), einem Feature (featureId) oder einer Projekt-Idee (ideaId)
// type: file | comment | mention | storno_request | storno_decision | status | feature | feature_comment | feature_status | idea | idea_comment | idea_status
// ToDos: Aufgaben für eine Person (Cutter, Admin oder Kunde), mit Priorität, Status und optionaler Deadline.
// Sichtbar für die zuständige Person, den Ersteller und Admins.
export const todos = pgTable(
  "todos",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    // hoch | mittel | niedrig
    priority: text("priority").notNull().default("mittel"),
    // offen | abgeschlossen
    status: text("status").notNull().default("offen"),
    deadline: date("deadline"),
    doneAt: timestamp("done_at"),
    doneBy: text("done_by").references(() => user.id, { onDelete: "set null" }),
    // Für welche Deadline schon erinnert wurde
    deadlineNotice: text("deadline_notice"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("todos_assignee_idx").on(t.assigneeId), index("todos_created_by_idx").on(t.createdBy)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    featureId: text("feature_id").references(() => featureRequests.id, { onDelete: "cascade" }),
    ideaId: text("idea_id").references(() => projectIdeas.id, { onDelete: "cascade" }),
    todoId: text("todo_id").references(() => todos.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    text: text("text").notNull(),
    actorId: text("actor_id"),
    fileId: text("file_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
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
      .references(() => customers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cutterId, t.clientId] })],
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
  // Persönliche Farbe ("#rrggbb"), sonst automatisch aus dem Namen – färbt Avatar, Board-Karten und Kalender
  color: text("color"),
  // Gespeicherte Filter je Ansicht, z. B. { "board": { "k": "id1,id2", "f": "shortform" }, "kalender": { "k": "" } }
  viewFilters: jsonb("view_filters").$type<Record<string, Record<string, string>>>().notNull().default({}),
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
      .references(() => customers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Beschreibung
    note: text("note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    // offen | in_arbeit | abgeschlossen (setzen Admins und Cutter)
    status: text("status").notNull().default("offen"),
    // hoch | mittel | niedrig (setzen alle, die die Idee sehen)
    priority: text("priority").notNull().default("mittel"),
    // Abschlussdatum (beim Status „abgeschlossen“) und wer abgeschlossen hat
    doneAt: timestamp("done_at"),
    doneBy: text("done_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("project_ideas_customer_idx").on(t.customerId)],
);

// Stimmen, Kommentare und Screenshots zu Projekt-Ideen (wie beim Featureboard)
export const ideaVotes = pgTable(
  "idea_votes",
  {
    ideaId: text("idea_id")
      .notNull()
      .references(() => projectIdeas.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.userId] })],
);

export const ideaComments = pgTable(
  "idea_comments",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => projectIdeas.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [index("idea_comments_idea_idx").on(t.ideaId)],
);

export const ideaAttachments = pgTable(
  "idea_attachments",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => projectIdeas.id, { onDelete: "cascade" }),
    // Bild als data-URL (im Browser verkleinert)
    data: text("data").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idea_attachments_idea_idx").on(t.ideaId)],
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
  (t) => [primaryKey({ columns: [t.featureId, t.userId] })],
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
  (t) => [index("feature_comments_feature_idx").on(t.featureId)],
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
  (t) => [index("feature_attachments_feature_idx").on(t.featureId)],
);

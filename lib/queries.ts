import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { account, cutterClients, featureRequests, jobComments, jobCutters, jobFiles, jobs, notifications, profiles, user } from "@/db/schema";

export type JobFileView = typeof jobFiles.$inferSelect & { uploaderName: string | null };

export type JobView = typeof jobs.$inferSelect & {
  customerName: string;
  cutters: { id: string; name: string }[];
  files: JobFileView[];
};

// Projekte inkl. Client-Name, Cuttern und hochgeladenen Dateien laden
export async function loadJobs(filter?: SQL): Promise<JobView[]> {
  const rows = await db
    .select({ job: jobs, customerName: user.name })
    .from(jobs)
    .innerJoin(user, eq(jobs.customerId, user.id))
    .where(filter ? and(ne(jobs.status, "entwurf"), filter) : ne(jobs.status, "entwurf"))
    .orderBy(desc(jobs.updatedAt));

  const ids = rows.map((r) => r.job.id);
  if (ids.length === 0) return [];

  // Original und Duplikate teilen sich den Raw-Ordner – ihr Rohmaterial wird bei allen Teilen angezeigt
  const rawFolders = [...new Set(rows.map((r) => r.job.rawFolderId).filter((id): id is string => !!id))];
  const familyRows = rawFolders.length
    ? await db.select({ id: jobs.id, rawFolderId: jobs.rawFolderId }).from(jobs).where(inArray(jobs.rawFolderId, rawFolders))
    : [];
  const familyIds = [...new Set([...ids, ...familyRows.map((f) => f.id)])];

  const [cutterRows, fileRows] = await Promise.all([
    db
      .select({ jobId: jobCutters.jobId, id: user.id, name: user.name })
      .from(jobCutters)
      .innerJoin(user, eq(jobCutters.userId, user.id))
      .where(inArray(jobCutters.jobId, ids))
      .orderBy(asc(jobCutters.createdAt)),
    db
      .select()
      .from(jobFiles)
      .where(and(inArray(jobFiles.jobId, familyIds), eq(jobFiles.uploaded, true)))
      .orderBy(asc(jobFiles.createdAt)),
  ]);
  const folderOf = new Map(familyRows.map((f) => [f.id, f.rawFolderId]));

  // Dateien eines Projekts: eigene fertige Videos + Rohmaterial der ganzen Familie (jede Datei nur einmal)
  function filesFor(job: typeof jobs.$inferSelect) {
    const own = fileRows.filter((f) => f.jobId === job.id && f.kind !== "roh");
    const seen = new Set<string>();
    const raw = fileRows.filter((f) => {
      if (f.kind !== "roh") return false;
      const sameFamily = f.jobId === job.id || (!!job.rawFolderId && folderOf.get(f.jobId) === job.rawFolderId);
      if (!sameFamily || seen.has(f.frameioFileId)) return false;
      seen.add(f.frameioFileId);
      return true;
    });
    return [...raw, ...own].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Namen derer, die Dateien hochgeladen haben
  const uploaderIds = [...new Set(fileRows.map((f) => f.uploadedBy).filter((id): id is string => !!id))];
  const uploaders = uploaderIds.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uploaderIds))
    : [];
  const nameOf = new Map(uploaders.map((u) => [u.id, u.name]));

  return rows.map(({ job, customerName }) => ({
    ...job,
    customerName,
    cutters: cutterRows.filter((c) => c.jobId === job.id).map((c) => ({ id: c.id, name: c.name })),
    files: filesFor(job).map((f) => ({ ...f, uploaderName: f.uploadedBy ? (nameOf.get(f.uploadedBy) ?? null) : null })),
  }));
}

export async function loadJob(id: string) {
  const [job] = await loadJobs(eq(jobs.id, id));
  return job ?? null;
}

// Projekte, an denen ein bestimmter Cutter beteiligt ist
export async function loadJobsOfCutter(cutterId: string) {
  const links = await db.select({ jobId: jobCutters.jobId }).from(jobCutters).where(eq(jobCutters.userId, cutterId));
  if (links.length === 0) return [];
  return loadJobs(
    inArray(
      jobs.id,
      links.map((l) => l.jobId),
    ),
  );
}

export async function listUsers(...roles: ("kunde" | "cutter" | "admin")[]) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    })
    .from(user)
    .where(inArray(user.role, roles))
    .orderBy(asc(user.name));
}

// ---------- Duplikate ("Teil 2", "Teil 3" …) ----------

// "Baustelle – Teil 2" → { base: "Baustelle", part: 2 }; ohne Zusatz → part 1
export function splitPart(title: string) {
  const m = title.match(/^(.*?)\s*(?:[–-]\s*)?\(?Teil\s+(\d+)\)?$/i);
  return m ? { base: m[1].trim(), part: Number(m[2]) } : { base: title.trim(), part: 1 };
}

// Vorschlag für den Titel des nächsten Teils: höchste vorhandene Teilnummer + 1
export async function nextPartTitle(job: { id: string; title: string; parentJobId: string | null }) {
  const rootId = job.parentJobId ?? job.id;
  const family = await db
    .select({ title: jobs.title })
    .from(jobs)
    .where(or(eq(jobs.id, rootId), eq(jobs.parentJobId, rootId)));
  const { base } = splitPart(job.title);
  const highest = Math.max(1, ...family.map((j) => splitPart(j.title).part));
  return `${base} – Teil ${highest + 1}`;
}

// ---------- Inbox ----------

// Ungelesene Benachrichtigungen je Projekt (für "Neu"-Markierungen auf Board und Karten)
export async function unreadByJob(userId: string) {
  const rows = await db
    .select({ jobId: notifications.jobId, featureId: notifications.featureId, fileId: notifications.fileId })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  const jobsMap = new Map<string, number>();
  const features = new Map<string, number>();
  const files = new Set<string>();
  for (const r of rows) {
    if (r.jobId) jobsMap.set(r.jobId, (jobsMap.get(r.jobId) ?? 0) + 1);
    if (r.featureId) features.set(r.featureId, (features.get(r.featureId) ?? 0) + 1);
    if (r.fileId) files.add(r.fileId);
  }
  const featureTotal = [...features.values()].reduce((a, b) => a + b, 0);
  return { jobs: jobsMap, features, featureTotal, files, total: rows.length };
}

export async function loadInbox(userId: string, limit = 200) {
  return db
    .select({
      id: notifications.id,
      jobId: notifications.jobId,
      featureId: notifications.featureId,
      type: notifications.type,
      text: notifications.text,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      featureTitle: featureRequests.title,
    })
    .from(notifications)
    .leftJoin(jobs, eq(notifications.jobId, jobs.id))
    .leftJoin(featureRequests, eq(notifications.featureId, featureRequests.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

// Kommentare eines Projekts mit Namen und Rolle der Verfasser
export async function loadComments(jobId: string) {
  return db
    .select({
      id: jobComments.id,
      body: jobComments.body,
      createdAt: jobComments.createdAt,
      editedAt: jobComments.editedAt,
      authorId: jobComments.authorId,
      authorName: user.name,
      authorRole: user.role,
    })
    .from(jobComments)
    .leftJoin(user, eq(jobComments.authorId, user.id))
    .where(eq(jobComments.jobId, jobId))
    .orderBy(asc(jobComments.createdAt));
}

// ---------- Personen mit Profil (Verwaltung, Meine Clients) ----------

export type PersonView = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  active: boolean | null;
  phone: string | null;
  links: string | null;
  notes: string | null;
  welcomeVideo: string | null;
  birthday: string | null;
  hasLogo: boolean;
  logoVersion: number;
  // eingeladen = Passwort noch nicht gesetzt
  invited: boolean;
};

export async function loadPeople(...roles: ("kunde" | "cutter" | "admin")[]): Promise<PersonView[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      phone: profiles.phone,
      links: profiles.links,
      notes: profiles.notes,
      welcomeVideo: profiles.welcomeVideo,
      birthday: profiles.birthday,
      hasLogo: sql<boolean>`${profiles.logo} is not null`,
      logoUpdated: profiles.updatedAt,
      accountId: account.id,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(inArray(user.role, roles))
    .orderBy(asc(user.name));
  return rows.map(({ logoUpdated, accountId, ...r }) => ({
    ...r,
    hasLogo: !!r.hasLogo,
    logoVersion: logoUpdated ? logoUpdated.getTime() : 0,
    invited: !accountId,
  }));
}

export async function loadPerson(id: string) {
  const [row] = (await loadPeople("kunde", "cutter", "admin")).filter((p) => p.id === id);
  return row ?? null;
}

// Logo-URL für <img>, oder null wenn kein Logo hinterlegt ist
export function logoUrl(p: { id: string; hasLogo: boolean; logoVersion: number }) {
  return p.hasLogo ? `/api/logo/${p.id}?v=${p.logoVersion}` : null;
}

// Freigaben: welche Cutter betreuen welchen Kunden
export async function loadAssignments() {
  return db.select().from(cutterClients);
}

// Kunden mit Logo-Info als Map (für Karten, Seitenleiste usw.)
export async function clientLogos() {
  const rows = await db
    .select({ id: profiles.userId, updated: profiles.updatedAt })
    .from(profiles)
    .where(isNotNull(profiles.logo));
  return new Map(rows.map((r) => [r.id, `/api/logo/${r.id}?v=${r.updated.getTime()}`]));
}

// Laufende Projekte (nicht Online/Storniert), in denen dieser Cutter der einzige zugeordnete Cutter ist
export async function activeJobsOnlyWith(cutterId: string) {
  const own = await db.select({ jobId: jobCutters.jobId }).from(jobCutters).where(eq(jobCutters.userId, cutterId));
  const ids = own.map((r) => r.jobId);
  if (ids.length === 0) return 0;
  const [shared, active] = await Promise.all([
    db
      .select({ jobId: jobCutters.jobId })
      .from(jobCutters)
      .where(and(inArray(jobCutters.jobId, ids), ne(jobCutters.userId, cutterId))),
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(inArray(jobs.id, ids), notInArray(jobs.status, ["online", "storniert", "entwurf"]))),
  ]);
  const covered = new Set(shared.map((r) => r.jobId));
  return active.filter((j) => !covered.has(j.id)).length;
}

// Wen darf man in den Kommentaren eines Projekts mit @ erwähnen?
// Staff: alle, die das Projekt sehen (Kunde, zugeordnete + freigegebene Cutter, Admins).
// Kunden: die zugeordneten Cutter und das Team (Admins). Man selbst ist nie dabei.
export async function mentionCandidates(
  job: { id: string; customerId: string },
  viewer: { id: string; role: string },
): Promise<{ id: string; name: string; email: string; role: string }[]> {
  const [assigned, freigabe, admins] = await Promise.all([
    db.select({ id: jobCutters.userId }).from(jobCutters).where(eq(jobCutters.jobId, job.id)),
    viewer.role === "kunde"
      ? Promise.resolve([] as { id: string }[])
      : db.select({ id: cutterClients.cutterId }).from(cutterClients).where(eq(cutterClients.clientId, job.customerId)),
    listUsers("admin"),
  ]);
  const ids = new Set([
    ...assigned.map((r) => r.id),
    ...freigabe.map((r) => r.id),
    ...(viewer.role === "kunde" ? [] : [job.customerId]),
  ]);
  const others = ids.size
    ? await db
        .select({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active })
        .from(user)
        .where(inArray(user.id, [...ids]))
    : [];
  const all = new Map<string, { id: string; name: string; email: string; role: string; active: boolean | null }>();
  for (const p of [...others, ...admins]) all.set(p.id, { ...p, role: p.role ?? "kunde" });
  return [...all.values()]
    .filter((p) => p.id !== viewer.id && p.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(({ id, name, email, role }) => ({ id, name, email, role }));
}

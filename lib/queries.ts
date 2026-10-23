import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { account, customerMembers, customers, cutterClients, featureRequests, projectIdeas, jobComments, jobCutters, jobFiles, jobs, notifications, profiles, user } from "@/db/schema";
import { cleanFilters, type FilterView, type ViewFilters } from "@/lib/view-filters";

export type JobFileView = typeof jobFiles.$inferSelect & { uploaderName: string | null };

export type JobView = typeof jobs.$inferSelect & {
  customerName: string;
  cutters: { id: string; name: string }[];
  files: JobFileView[];
};

// Projekte inkl. Client-Name, Cuttern und hochgeladenen Dateien laden
export async function loadJobs(filter?: SQL): Promise<JobView[]> {
  const rows = await db
    .select({ job: jobs, customerName: customers.name })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
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
    .select({
      jobId: notifications.jobId,
      featureId: notifications.featureId,
      ideaId: notifications.ideaId,
      fileId: notifications.fileId,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  const jobsMap = new Map<string, number>();
  const features = new Map<string, number>();
  const ideas = new Map<string, number>();
  const files = new Set<string>();
  for (const r of rows) {
    if (r.jobId) jobsMap.set(r.jobId, (jobsMap.get(r.jobId) ?? 0) + 1);
    if (r.featureId) features.set(r.featureId, (features.get(r.featureId) ?? 0) + 1);
    if (r.ideaId) ideas.set(r.ideaId, (ideas.get(r.ideaId) ?? 0) + 1);
    if (r.fileId) files.add(r.fileId);
  }
  const featureTotal = [...features.values()].reduce((a, b) => a + b, 0);
  const ideaTotal = [...ideas.values()].reduce((a, b) => a + b, 0);
  return { jobs: jobsMap, features, featureTotal, ideas, ideaTotal, files, total: rows.length };
}

export async function loadInbox(userId: string, limit = 200) {
  return db
    .select({
      id: notifications.id,
      jobId: notifications.jobId,
      featureId: notifications.featureId,
      ideaId: notifications.ideaId,
      type: notifications.type,
      text: notifications.text,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      featureTitle: featureRequests.title,
      ideaTitle: projectIdeas.title,
    })
    .from(notifications)
    .leftJoin(jobs, eq(notifications.jobId, jobs.id))
    .leftJoin(featureRequests, eq(notifications.featureId, featureRequests.id))
    .leftJoin(projectIdeas, eq(notifications.ideaId, projectIdeas.id))
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
  color: string | null;
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
      color: profiles.color,
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

// Logos als Map (ID → URL): Kunden (Firmen) und Personen mit eigenem Logo (für Karten, Seitenleiste usw.)
export async function clientLogos() {
  const [people, firms] = await Promise.all([
    db.select({ id: profiles.userId, updated: profiles.updatedAt }).from(profiles).where(isNotNull(profiles.logo)),
    db.select({ id: customers.id, updated: customers.updatedAt }).from(customers).where(isNotNull(customers.logo)),
  ]);
  // Kunden zuletzt: übernommene Altkunden haben dieselbe ID wie ihr erster Nutzer
  return new Map([...people, ...firms].map((r) => [r.id, `/api/logo/${r.id}?v=${r.updated.getTime()}`]));
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
  // Nutzer des Kunden (für Kunden: die Kolleginnen und Kollegen)
  const members = await memberIds(job.customerId);
  const ids = new Set([...assigned.map((r) => r.id), ...freigabe.map((r) => r.id), ...members]);
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

// Gewählte Farben: Personen und Kunden (nur, wo eine Farbe gesetzt ist). Kunden zuletzt, sie haben Vorrang.
export async function loadColors() {
  const [people, firms] = await Promise.all([
    db.select({ id: profiles.userId, color: profiles.color }).from(profiles).where(isNotNull(profiles.color)),
    db.select({ id: customers.id, color: customers.color }).from(customers).where(isNotNull(customers.color)),
  ]);
  return [...people, ...firms];
}

// ---------- Kunden (Firmen) ----------

// Alle Kunden für Auswahllisten und Filter
export async function listCustomers() {
  return db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name));
}

// Nutzer-IDs eines Kunden (für Benachrichtigungen)
export async function memberIds(customerId: string) {
  const rows = await db
    .select({ id: customerMembers.userId })
    .from(customerMembers)
    .where(eq(customerMembers.customerId, customerId));
  return rows.map((r) => r.id);
}

export type LinkEntry = { label: string; url: string };
export type CustomerLinks = { tiktok: string; youtube: string; instagram: string; extra: LinkEntry[] };

// Links eines Kunden: neues JSON-Format, sonst aus der alten Liste (eine pro Zeile) ableiten
export function parseLinks(linkList: string | null, legacy: string | null): CustomerLinks {
  const empty: CustomerLinks = { tiktok: "", youtube: "", instagram: "", extra: [] };
  if (linkList) {
    try {
      const j = JSON.parse(linkList);
      return {
        tiktok: typeof j.tiktok === "string" ? j.tiktok : "",
        youtube: typeof j.youtube === "string" ? j.youtube : "",
        instagram: typeof j.instagram === "string" ? j.instagram : "",
        extra: Array.isArray(j.extra)
          ? j.extra
              .filter((e: unknown): e is LinkEntry => !!e && typeof (e as LinkEntry).url === "string")
              .map((e: LinkEntry) => ({ label: String(e.label ?? ""), url: e.url }))
          : [],
      };
    } catch {
      // kaputtes JSON → wie leer behandeln und unten die alte Liste nehmen
    }
  }
  const out = { ...empty, extra: [] as LinkEntry[] };
  for (const raw of (legacy ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
    if (host.endsWith("tiktok.com") && !out.tiktok) out.tiktok = raw;
    else if ((host.endsWith("youtube.com") || host === "youtu.be") && !out.youtube) out.youtube = raw;
    else if (host.endsWith("instagram.com") && !out.instagram) out.instagram = raw;
    else out.extra.push({ label: host || "Link", url: raw });
  }
  return out;
}

export type CustomerMemberView = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  invited: boolean; // Passwort noch nicht gesetzt
  welcomeVideo: string | null;
  phone: string | null;
  birthday: string | null;
  color: string | null;
  version: number;
};

export type CustomerView = {
  id: string;
  name: string;
  notes: string | null;
  color: string | null;
  links: CustomerLinks;
  hasLogo: boolean;
  hasCover: boolean;
  version: number; // für Bild-URLs (?v=…)
  members: CustomerMemberView[];
};

// Kunden mit Profil und Nutzern (ohne Bilddaten – die kommen über /api/logo und /api/cover)
export async function loadCustomers(ids?: string[]): Promise<CustomerView[]> {
  if (ids && ids.length === 0) return [];
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      notes: customers.notes,
      color: customers.color,
      links: customers.links,
      linkList: customers.linkList,
      hasLogo: sql<boolean>`${customers.logo} is not null`,
      hasCover: sql<boolean>`${customers.cover} is not null`,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(ids ? inArray(customers.id, ids) : undefined)
    .orderBy(asc(customers.name));
  if (rows.length === 0) return [];
  const members = await db
    .select({
      customerId: customerMembers.customerId,
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: customerMembers.isAdmin,
      accountId: account.id,
      welcomeVideo: profiles.welcomeVideo,
      phone: profiles.phone,
      birthday: profiles.birthday,
      color: profiles.color,
      updated: profiles.updatedAt,
    })
    .from(customerMembers)
    .innerJoin(user, eq(customerMembers.userId, user.id))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(
      inArray(
        customerMembers.customerId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(customerMembers.createdAt), asc(user.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    color: r.color,
    links: parseLinks(r.linkList, r.links),
    hasLogo: !!r.hasLogo,
    hasCover: !!r.hasCover,
    version: r.updatedAt.getTime(),
    members: members
      .filter((m) => m.customerId === r.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        isAdmin: m.isAdmin,
        invited: !m.accountId,
        welcomeVideo: m.welcomeVideo,
        phone: m.phone,
        birthday: m.birthday,
        color: m.color,
        version: m.updated?.getTime() ?? 0,
      })),
  }));
}

export async function loadCustomer(id: string) {
  const [c] = await loadCustomers([id]);
  return c ?? null;
}

export const customerLogoUrl = (c: { id: string; hasLogo: boolean; version: number }) =>
  c.hasLogo ? `/api/logo/${c.id}?v=${c.version}` : null;
export const customerCoverUrl = (c: { id: string; hasCover: boolean; version: number }) =>
  c.hasCover ? `/api/cover/${c.id}?v=${c.version}` : null;

// Gespeicherte Filter einer Ansicht für einen Nutzer (leer = Standard: alles anzeigen)
export async function loadViewFilters(userId: string, view: FilterView): Promise<ViewFilters> {
  const [row] = await db
    .select({ filters: profiles.viewFilters })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const saved = row?.filters?.[view];
  return saved && typeof saved === "object" ? cleanFilters(view, saved) : {};
}

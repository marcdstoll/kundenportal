import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
// Alten Status "complete" aus v2 umstellen (läuft bei jedem Start, ändert danach nichts mehr)
await client`update jobs set status = 'ready_to_post' where status = 'complete'`;
// Etappe 3: Beim ersten Start Freigaben aus bisherigen Projekten übernehmen,
// damit Cutter ihre Kunden weiter sehen (läuft nur, solange noch keine Freigabe existiert)
try {
  const [{ count }] = await client`select count(*)::int as count from cutter_clients`;
  if (count === 0) {
    const added = await client`
      insert into cutter_clients (cutter_id, client_id)
      select distinct jc.user_id, j.customer_id
      from job_cutters jc
      join jobs j on j.id = jc.job_id
      join "user" u on u.id = jc.user_id
      where u.role = 'cutter'
      on conflict do nothing`;
    console.log(`Freigaben übernommen: ${added.count}`);
  }
} catch (e) {
  console.error("Freigaben konnten nicht übernommen werden:", e.message);
}
await client.end();
console.log("Migrationen eingespielt");

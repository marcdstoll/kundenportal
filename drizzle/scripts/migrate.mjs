import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
// Alte Status aus v2 auf die neuen Notion-Status umstellen (läuft bei jedem Start, ändert danach nichts mehr)
await client`update jobs set status = 'in_arbeit' where status = 'warteschlange'`;
await client`update jobs set status = 'ready_to_post' where status = 'complete'`;
await client.end();
console.log("Migrationen eingespielt");

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export * from "./auth-schema";

export const frameioConnection = pgTable("frameio_connection", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
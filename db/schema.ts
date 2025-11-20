import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const exampleTable = pgTable("example_table", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
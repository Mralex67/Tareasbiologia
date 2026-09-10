import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  course: text("course").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = typeof tasksTable.$inferInsert;
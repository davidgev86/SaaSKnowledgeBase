import { sql, relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Knowledge Base table - Each user can have one knowledge base
export const knowledgeBases = pgTable("knowledge_bases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  siteTitle: varchar("site_title").notNull().default("Knowledge Base"),
  logoUrl: varchar("logo_url"),
  primaryColor: varchar("primary_color").default("#3B82F6"),
  customDomain: varchar("custom_domain"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  user: one(users, {
    fields: [knowledgeBases.userId],
    references: [users.id],
  }),
  articles: many(articles),
  categories: many(categories),
}));

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;

// Categories table
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [categories.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  articles: many(articles),
}));

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Articles table
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const articlesRelations = relations(articles, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [articles.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  category: one(categories, {
    fields: [articles.categoryId],
    references: [categories.id],
  }),
  analyticsViews: many(analyticsViews),
  feedback: many(articleFeedback),
}));

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

// Analytics Views table - Track article views
export const analyticsViews = pgTable("analytics_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

export const analyticsViewsRelations = relations(analyticsViews, ({ one }) => ({
  article: one(articles, {
    fields: [analyticsViews.articleId],
    references: [articles.id],
  }),
}));

export const insertAnalyticsViewSchema = createInsertSchema(analyticsViews).omit({
  id: true,
  viewedAt: true,
});

export type InsertAnalyticsView = z.infer<typeof insertAnalyticsViewSchema>;
export type AnalyticsView = typeof analyticsViews.$inferSelect;

// Analytics Searches table - Track search queries
export const analyticsSearches = pgTable("analytics_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  query: varchar("query").notNull(),
  searchedAt: timestamp("searched_at").defaultNow(),
});

export const analyticsSearchesRelations = relations(analyticsSearches, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [analyticsSearches.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
}));

export const insertAnalyticsSearchSchema = createInsertSchema(analyticsSearches).omit({
  id: true,
  searchedAt: true,
});

export type InsertAnalyticsSearch = z.infer<typeof insertAnalyticsSearchSchema>;
export type AnalyticsSearch = typeof analyticsSearches.$inferSelect;

// Article Feedback table - Thumbs up/down
export const articleFeedback = pgTable("article_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  isHelpful: boolean("is_helpful").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const articleFeedbackRelations = relations(articleFeedback, ({ one }) => ({
  article: one(articles, {
    fields: [articleFeedback.articleId],
    references: [articles.id],
  }),
}));

export const insertArticleFeedbackSchema = createInsertSchema(articleFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertArticleFeedback = z.infer<typeof insertArticleFeedbackSchema>;
export type ArticleFeedback = typeof articleFeedback.$inferSelect;

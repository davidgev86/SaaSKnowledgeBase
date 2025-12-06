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

// Knowledge Base table - Users can have multiple knowledge bases
export const knowledgeBases = pgTable("knowledge_bases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug").notNull().unique(),
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

// Article Revisions table - Version history for articles
export const articleRevisions = pgTable("article_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  categoryId: varchar("category_id"),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const articleRevisionsRelations = relations(articleRevisions, ({ one }) => ({
  article: one(articles, {
    fields: [articleRevisions.articleId],
    references: [articles.id],
  }),
  author: one(users, {
    fields: [articleRevisions.createdBy],
    references: [users.id],
  }),
}));

export const insertArticleRevisionSchema = createInsertSchema(articleRevisions).omit({
  id: true,
  createdAt: true,
});

export type InsertArticleRevision = z.infer<typeof insertArticleRevisionSchema>;
export type ArticleRevision = typeof articleRevisions.$inferSelect;

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

// Team Members table - Multi-user collaboration
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  invitedEmail: varchar("invited_email").notNull(),
  role: varchar("role").notNull().default("viewer"), // admin, contributor, viewer
  status: varchar("status").notNull().default("pending"), // pending, active
  inviteToken: varchar("invite_token"),
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [teamMembers.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  invitedAt: true,
});

export const updateTeamMemberSchema = insertTeamMemberSchema.partial().extend({
  acceptedAt: z.date().optional(),
});

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type UpdateTeamMember = z.infer<typeof updateTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// Integrations table - Store integration configurations per KB
export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // servicenow, slack, zendesk, intercom, etc.
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const integrationsRelations = relations(integrations, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [integrations.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
}));

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
});

export const updateIntegrationSchema = insertIntegrationSchema.partial();

export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type UpdateIntegration = z.infer<typeof updateIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

// ServiceNow specific config type
export const serviceNowConfigSchema = z.object({
  instanceUrl: z.string().url().optional(),
  knowledgeBaseId: z.string().optional(), // ServiceNow KB sys_id
  incidentFormEnabled: z.boolean().default(false),
  autoSync: z.boolean().default(false),
});

export type ServiceNowConfig = z.infer<typeof serviceNowConfigSchema>;

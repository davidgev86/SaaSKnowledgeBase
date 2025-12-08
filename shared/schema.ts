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

// Slack specific config type
export const slackConfigSchema = z.object({
  teamId: z.string().optional(), // Slack workspace ID
  teamName: z.string().optional(), // Slack workspace name
  channelId: z.string().optional(), // Default channel for notifications
  channelName: z.string().optional(),
  notifyOnPublish: z.boolean().default(false), // Post when article is published
  slashCommandEnabled: z.boolean().default(true), // Enable /kb slash command
});

export type SlackConfig = z.infer<typeof slackConfigSchema>;

// SSO specific config type - supports SAML 2.0 and OIDC
export const ssoConfigSchema = z.object({
  // Provider type
  provider: z.enum(['saml', 'oidc']).default('oidc'),
  providerName: z.string().optional(), // Display name (e.g., "Okta", "Azure AD")
  
  // OIDC settings
  oidcIssuerUrl: z.string().url().optional(), // OIDC discovery URL
  oidcClientId: z.string().optional(),
  oidcClientSecret: z.string().optional(), // Encrypted/masked in responses
  
  // SAML settings
  samlEntryPoint: z.string().url().optional(), // IdP SSO URL
  samlIssuer: z.string().optional(), // SP Entity ID
  samlCertificate: z.string().optional(), // IdP X.509 certificate
  
  // General settings
  enforceForTeam: z.boolean().default(false), // Require SSO for all team members
  allowedDomains: z.array(z.string()).default([]), // Email domains allowed
  autoProvision: z.boolean().default(true), // Auto-create users on first login
  defaultRole: z.enum(['viewer', 'contributor', 'admin']).default('viewer'),
});

export type SSOConfig = z.infer<typeof ssoConfigSchema>;

// Microsoft Teams specific config type
export const teamsConfigSchema = z.object({
  // Azure AD App credentials
  tenantId: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(), // Encrypted in responses
  
  // OAuth tokens (stored after connection)
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().optional(),
  
  // Connected team/channel info
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  
  // Webhook URL for incoming messages (if using incoming webhook instead of bot)
  webhookUrl: z.string().optional(),
  
  // Feature toggles
  searchEnabled: z.boolean().default(false), // Enable /kb search command
  notifyOnPublish: z.boolean().default(false), // Post to channel when article published
  
  // Bot configuration
  botId: z.string().optional(),
  botServiceUrl: z.string().optional(),
});

export type TeamsConfig = z.infer<typeof teamsConfigSchema>;

// Helpdesk (Zendesk/Freshdesk) specific config type
export const helpdeskConfigSchema = z.object({
  // Provider type
  provider: z.enum(['zendesk', 'freshdesk']).default('zendesk'),
  
  // Connection settings
  subdomain: z.string().optional(), // e.g., "mycompany" for mycompany.zendesk.com
  email: z.string().email().optional(), // Admin email for API auth
  apiToken: z.string().optional(), // Encrypted in responses
  
  // Freshdesk-specific
  apiKey: z.string().optional(), // Freshdesk uses API key instead of token
  
  // Mapping settings
  defaultSectionId: z.string().optional(), // Zendesk section to sync to
  defaultFolderId: z.string().optional(), // Freshdesk folder to sync to
  categoryMappings: z.array(z.object({
    localCategoryId: z.string(),
    externalSectionId: z.string(),
    externalSectionName: z.string().optional(),
  })).default([]),
  
  // Sync settings
  syncDirection: z.enum(['import', 'export', 'both']).default('both'),
  autoSync: z.boolean().default(false),
  lastImportAt: z.string().optional(),
  lastExportAt: z.string().optional(),
});

export type HelpdeskConfig = z.infer<typeof helpdeskConfigSchema>;

// External Article Mappings table - Track synced articles between local and external systems
export const externalArticleMappings = pgTable("external_article_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  localArticleId: varchar("local_article_id").references(() => articles.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // zendesk, freshdesk
  externalId: varchar("external_id").notNull(), // Article ID in external system
  externalUrl: varchar("external_url"), // Direct link to article in external system
  syncDirection: varchar("sync_direction").notNull(), // imported, exported
  localUpdatedAt: timestamp("local_updated_at"),
  externalUpdatedAt: timestamp("external_updated_at"),
  contentHash: varchar("content_hash"), // Hash of content for change detection
  hasConflict: boolean("has_conflict").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const externalArticleMappingsRelations = relations(externalArticleMappings, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [externalArticleMappings.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  article: one(articles, {
    fields: [externalArticleMappings.localArticleId],
    references: [articles.id],
  }),
}));

export const insertExternalArticleMappingSchema = createInsertSchema(externalArticleMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExternalArticleMapping = z.infer<typeof insertExternalArticleMappingSchema>;
export type ExternalArticleMapping = typeof externalArticleMappings.$inferSelect;

// Sync Jobs table - Track sync history and status
export const syncJobs = pgTable("sync_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // zendesk, freshdesk, servicenow
  direction: varchar("direction").notNull(), // import, export
  status: varchar("status").notNull().default("pending"), // pending, running, completed, failed
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  createdItems: integer("created_items").default(0),
  updatedItems: integer("updated_items").default(0),
  skippedItems: integer("skipped_items").default(0),
  failedItems: integer("failed_items").default(0),
  errorLog: jsonb("error_log").$type<Array<{ articleId?: string; error: string; timestamp: string }>>().default([]),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [syncJobs.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
}));

export const insertSyncJobSchema = createInsertSchema(syncJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;
export type SyncJob = typeof syncJobs.$inferSelect;

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  hashedKey: varchar("hashed_key").notNull(),
  scopes: text("scopes").array().notNull().default(sql`ARRAY['read']::text[]`),
  rateLimitOverride: integer("rate_limit_override"),
  requestCount: integer("request_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, {
    fields: [apiKeys.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
}));

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  requestCount: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export const apiKeyScopesEnum = z.enum(["read", "write"]);
export type ApiKeyScope = z.infer<typeof apiKeyScopesEnum>;

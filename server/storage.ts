import {
  users,
  knowledgeBases,
  articles,
  categories,
  analyticsViews,
  analyticsSearches,
  articleFeedback,
  teamMembers,
  articleRevisions,
  type User,
  type UpsertUser,
  type KnowledgeBase,
  type InsertKnowledgeBase,
  type Article,
  type InsertArticle,
  type Category,
  type InsertCategory,
  type InsertAnalyticsView,
  type InsertAnalyticsSearch,
  type InsertArticleFeedback,
  type InsertTeamMember,
  type UpdateTeamMember,
  type TeamMember,
  type ArticleRevision,
  type InsertArticleRevision,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getKnowledgeBasesByUserId(userId: string): Promise<KnowledgeBase[]>;
  getKnowledgeBaseByUserId(userId: string): Promise<KnowledgeBase | undefined>;
  getKnowledgeBaseById(id: string): Promise<KnowledgeBase | undefined>;
  createKnowledgeBase(kb: InsertKnowledgeBase): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: string, kb: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase>;

  getArticlesByKnowledgeBaseId(kbId: string): Promise<Article[]>;
  getArticleById(id: string): Promise<Article | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  updateArticle(id: string, article: Partial<InsertArticle>): Promise<Article>;
  deleteArticle(id: string): Promise<void>;

  getCategoriesByKnowledgeBaseId(kbId: string): Promise<Category[]>;
  getCategoryById(id: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  trackArticleView(view: InsertAnalyticsView): Promise<void>;
  getArticleViewStats(kbId: string, startDate?: Date, endDate?: Date): Promise<any>;

  trackSearch(search: InsertAnalyticsSearch): Promise<void>;
  getSearchStats(kbId: string): Promise<any>;

  submitArticleFeedback(feedback: InsertArticleFeedback): Promise<void>;

  searchArticles(kbId: string, query: string): Promise<Article[]>;

  getTeamMembersByKnowledgeBaseId(kbId: string): Promise<TeamMember[]>;
  getTeamMemberById(id: string): Promise<TeamMember | undefined>;
  getTeamMemberByToken(token: string): Promise<TeamMember | undefined>;
  getUserRole(userId: string, kbId: string): Promise<string | undefined>;
  getKnowledgeBaseForUser(userId: string): Promise<KnowledgeBase | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, member: UpdateTeamMember): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  getRevisionsByArticleId(articleId: string): Promise<ArticleRevision[]>;
  getRevisionByVersion(articleId: string, version: number): Promise<ArticleRevision | undefined>;
  createRevision(revision: InsertArticleRevision): Promise<ArticleRevision>;
  getLatestRevisionVersion(articleId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getKnowledgeBasesByUserId(userId: string): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases).where(eq(knowledgeBases.userId, userId));
  }

  async getKnowledgeBaseByUserId(userId: string): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.userId, userId)).limit(1);
    return kb;
  }

  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
    return kb;
  }

  async createKnowledgeBase(kbData: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const [kb] = await db.insert(knowledgeBases).values(kbData).returning();
    return kb;
  }

  async updateKnowledgeBase(id: string, kbData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase> {
    const [kb] = await db
      .update(knowledgeBases)
      .set({ ...kbData, updatedAt: new Date() })
      .where(eq(knowledgeBases.id, id))
      .returning();
    return kb;
  }

  async getArticlesByKnowledgeBaseId(kbId: string): Promise<Article[]> {
    return db.select().from(articles).where(eq(articles.knowledgeBaseId, kbId)).orderBy(desc(articles.updatedAt));
  }

  async getArticleById(id: string): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.id, id));
    return article;
  }

  async createArticle(articleData: InsertArticle): Promise<Article> {
    const [article] = await db.insert(articles).values(articleData).returning();
    return article;
  }

  async updateArticle(id: string, articleData: Partial<InsertArticle>): Promise<Article> {
    const [article] = await db
      .update(articles)
      .set({ ...articleData, updatedAt: new Date() })
      .where(eq(articles.id, id))
      .returning();
    return article;
  }

  async deleteArticle(id: string): Promise<void> {
    await db.delete(articles).where(eq(articles.id, id));
  }

  async getCategoriesByKnowledgeBaseId(kbId: string): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.knowledgeBaseId, kbId)).orderBy(categories.order);
  }

  async getCategoryById(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async createCategory(categoryData: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(categoryData).returning();
    return category;
  }

  async updateCategory(id: string, categoryData: Partial<InsertCategory>): Promise<Category> {
    const [category] = await db
      .update(categories)
      .set({ ...categoryData, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return category;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async trackArticleView(viewData: InsertAnalyticsView): Promise<void> {
    await db.insert(analyticsViews).values(viewData);
  }

  async getArticleViewStats(kbId: string, startDate?: Date, endDate?: Date): Promise<any> {
    const dateFilter = startDate && endDate
      ? and(
          eq(articles.knowledgeBaseId, kbId),
          sql`${analyticsViews.viewedAt} >= ${startDate}`,
          sql`${analyticsViews.viewedAt} <= ${endDate}`
        )
      : eq(articles.knowledgeBaseId, kbId);

    const articleViews = await db
      .select({
        articleId: analyticsViews.articleId,
        articleTitle: articles.title,
        views: sql<number>`count(*)::int`,
      })
      .from(analyticsViews)
      .innerJoin(articles, eq(analyticsViews.articleId, articles.id))
      .where(dateFilter!)
      .groupBy(analyticsViews.articleId, articles.title)
      .orderBy(desc(sql`count(*)`));

    const totalViews = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(analyticsViews)
      .innerJoin(articles, eq(analyticsViews.articleId, articles.id))
      .where(dateFilter!);

    const viewsByDate = await db
      .select({
        date: sql<string>`DATE(${analyticsViews.viewedAt})`,
        views: sql<number>`count(*)::int`,
      })
      .from(analyticsViews)
      .innerJoin(articles, eq(analyticsViews.articleId, articles.id))
      .where(dateFilter!)
      .groupBy(sql`DATE(${analyticsViews.viewedAt})`)
      .orderBy(sql`DATE(${analyticsViews.viewedAt})`);

    return {
      totalViews: totalViews[0]?.count || 0,
      recentViews: articleViews,
      viewsByDate,
    };
  }

  async trackSearch(searchData: InsertAnalyticsSearch): Promise<void> {
    await db.insert(analyticsSearches).values(searchData);
  }

  async getSearchStats(kbId: string): Promise<any> {
    const searchQueries = await db
      .select({
        query: analyticsSearches.query,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsSearches)
      .where(eq(analyticsSearches.knowledgeBaseId, kbId))
      .groupBy(analyticsSearches.query)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const totalSearches = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(analyticsSearches)
      .where(eq(analyticsSearches.knowledgeBaseId, kbId));

    return {
      totalSearches: totalSearches[0]?.count || 0,
      recentSearches: searchQueries,
    };
  }

  async submitArticleFeedback(feedbackData: InsertArticleFeedback): Promise<void> {
    await db.insert(articleFeedback).values(feedbackData);
  }

  async searchArticles(kbId: string, query: string): Promise<Article[]> {
    const searchPattern = `%${query}%`;
    return db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.knowledgeBaseId, kbId),
          eq(articles.isPublic, true),
          or(
            ilike(articles.title, searchPattern),
            ilike(articles.content, searchPattern)
          )
        )
      )
      .orderBy(desc(articles.updatedAt));
  }

  async getTeamMembersByKnowledgeBaseId(kbId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.knowledgeBaseId, kbId));
  }

  async getTeamMemberById(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMemberByToken(token: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.inviteToken, token));
    return member;
  }

  async getUserRole(userId: string, kbId: string): Promise<string | undefined> {
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.knowledgeBaseId, kbId),
          eq(teamMembers.status, "active")
        )
      );
    
    const kb = await this.getKnowledgeBaseById(kbId);
    if (kb && kb.userId === userId) {
      return "owner";
    }
    
    return member?.role;
  }

  async getKnowledgeBaseForUser(userId: string): Promise<KnowledgeBase | undefined> {
    const ownedKb = await this.getKnowledgeBaseByUserId(userId);
    if (ownedKb) {
      return ownedKb;
    }

    const [membership] = await db
      .select({ kb: knowledgeBases })
      .from(teamMembers)
      .innerJoin(knowledgeBases, eq(teamMembers.knowledgeBaseId, knowledgeBases.id))
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active")))
      .limit(1);

    return membership?.kb;
  }

  async createTeamMember(memberData: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(memberData).returning();
    return member;
  }

  async updateTeamMember(id: string, memberData: UpdateTeamMember): Promise<TeamMember> {
    const [member] = await db
      .update(teamMembers)
      .set(memberData)
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  async getRevisionsByArticleId(articleId: string): Promise<ArticleRevision[]> {
    return db
      .select()
      .from(articleRevisions)
      .where(eq(articleRevisions.articleId, articleId))
      .orderBy(desc(articleRevisions.version));
  }

  async getRevisionByVersion(articleId: string, version: number): Promise<ArticleRevision | undefined> {
    const [revision] = await db
      .select()
      .from(articleRevisions)
      .where(
        and(
          eq(articleRevisions.articleId, articleId),
          eq(articleRevisions.version, version)
        )
      );
    return revision;
  }

  async createRevision(revisionData: InsertArticleRevision): Promise<ArticleRevision> {
    const [revision] = await db.insert(articleRevisions).values(revisionData).returning();
    return revision;
  }

  async getLatestRevisionVersion(articleId: string): Promise<number> {
    const [result] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${articleRevisions.version}), 0)` })
      .from(articleRevisions)
      .where(eq(articleRevisions.articleId, articleId));
    return result?.maxVersion ?? 0;
  }
}

export const storage = new DatabaseStorage();

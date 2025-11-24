import {
  users,
  knowledgeBases,
  articles,
  categories,
  analyticsViews,
  analyticsSearches,
  articleFeedback,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

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
  getArticleViewStats(kbId: string): Promise<any>;

  trackSearch(search: InsertAnalyticsSearch): Promise<void>;
  getSearchStats(kbId: string): Promise<any>;

  submitArticleFeedback(feedback: InsertArticleFeedback): Promise<void>;

  searchArticles(kbId: string, query: string): Promise<Article[]>;
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

  async getArticleViewStats(kbId: string): Promise<any> {
    const articleViews = await db
      .select({
        articleId: analyticsViews.articleId,
        articleTitle: articles.title,
        views: sql<number>`count(*)::int`,
      })
      .from(analyticsViews)
      .innerJoin(articles, eq(analyticsViews.articleId, articles.id))
      .where(eq(articles.knowledgeBaseId, kbId))
      .groupBy(analyticsViews.articleId, articles.title)
      .orderBy(desc(sql`count(*)`));

    const totalViews = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(analyticsViews)
      .innerJoin(articles, eq(analyticsViews.articleId, articles.id))
      .where(eq(articles.knowledgeBaseId, kbId));

    return {
      totalViews: totalViews[0]?.count || 0,
      recentViews: articleViews,
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
    return db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.knowledgeBaseId, kbId),
          eq(articles.isPublic, true),
          sql`(${articles.title} ILIKE ${`%${query}%`} OR ${articles.content} ILIKE ${`%${query}%`})`
        )
      )
      .orderBy(desc(articles.updatedAt));
  }
}

export const storage = new DatabaseStorage();

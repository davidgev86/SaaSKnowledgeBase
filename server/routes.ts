import type { Express, Request } from "express";
import { isAuthenticated } from "./replitAuth";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertKnowledgeBaseSchema, insertArticleSchema, insertCategorySchema, insertTeamMemberSchema, serviceNowConfigSchema, slackConfigSchema } from "@shared/schema";
import { z } from "zod";
import { emailService } from "./email";
import { ServiceNowService, getServiceNowCredentials } from "./services/servicenow";
import { SlackService, getSlackCredentials } from "./services/slack";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "contributor", "viewer"]),
});

const roleUpdateSchema = z.object({
  role: z.enum(["admin", "contributor", "viewer"]),
});

const objectStorageService = new ObjectStorageService();

function getUserId(req: Request): string {
  const user = req.user as any;
  return user?.claims?.sub;
}

async function checkUserCanEdit(userId: string, kbId: string): Promise<boolean> {
  const role = await storage.getUserRole(userId, kbId);
  return role === "owner" || role === "admin" || role === "contributor";
}

async function checkUserCanManage(userId: string, kbId: string): Promise<boolean> {
  const role = await storage.getUserRole(userId, kbId);
  return role === "owner" || role === "admin";
}

export function registerRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbs = await storage.getAccessibleKnowledgeBases(userId);
      res.json(kbs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const siteTitle = req.body.siteTitle || "Knowledge Base";
      const slug = await storage.generateUniqueSlug(siteTitle);
      
      const kb = await storage.createKnowledgeBase({
        userId,
        slug,
        siteTitle,
        logoUrl: req.body.logoUrl || null,
        primaryColor: req.body.primaryColor || "#3B82F6",
        customDomain: req.body.customDomain || null,
      });
      res.json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/knowledge-bases/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getKnowledgeBaseById(req.params.id);
      if (!existing || existing.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const kb = await storage.updateKnowledgeBase(req.params.id, req.body);
      res.json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  async function getSelectedKnowledgeBase(userId: string, kbId?: string) {
    if (kbId) {
      const kb = await storage.getKnowledgeBaseById(kbId);
      if (kb && await storage.hasAccessToKnowledgeBase(userId, kbId)) {
        return kb;
      }
      return undefined;
    }
    return storage.getKnowledgeBaseForUser(userId);
  }

  app.get("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.json([]);
      }
      const articles = await storage.getArticlesByKnowledgeBaseId(kb.id);
      res.json(articles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const userRole = await storage.getUserRole(userId, article.knowledgeBaseId);
      if (!userRole) {
        return res.status(403).json({ message: "You don't have access to this article" });
      }
      
      res.json(article);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = (req.query.kbId as string) || req.body.knowledgeBaseId;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
      }

      const canEdit = await checkUserCanEdit(userId, kb.id);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to create articles" });
      }

      const article = await storage.createArticle({
        knowledgeBaseId: kb.id,
        title: req.body.title,
        content: req.body.content,
        categoryId: req.body.categoryId || null,
        isPublic: req.body.isPublic ?? false,
      });
      res.json(article);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getArticleById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const canEdit = await checkUserCanEdit(userId, existing.knowledgeBaseId);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to edit this article" });
      }
      
      // Save current version as a revision before updating
      const latestVersion = await storage.getLatestRevisionVersion(req.params.id);
      await storage.createRevision({
        articleId: req.params.id,
        version: latestVersion + 1,
        title: existing.title,
        content: existing.content,
        categoryId: existing.categoryId,
        isPublic: existing.isPublic,
        createdBy: userId,
      });
      
      const article = await storage.updateArticle(req.params.id, req.body);
      res.json(article);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/articles/:id/revisions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const userRole = await storage.getUserRole(userId, article.knowledgeBaseId);
      if (!userRole) {
        return res.status(403).json({ message: "You don't have access to this article" });
      }
      
      const revisions = await storage.getRevisionsByArticleId(req.params.id);
      res.json(revisions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/articles/:id/revisions/:version", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const userRole = await storage.getUserRole(userId, article.knowledgeBaseId);
      if (!userRole) {
        return res.status(403).json({ message: "You don't have access to this article" });
      }
      
      const version = parseInt(req.params.version, 10);
      const revision = await storage.getRevisionByVersion(req.params.id, version);
      if (!revision) {
        return res.status(404).json({ message: "Revision not found" });
      }
      
      res.json(revision);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/articles/:id/restore/:version", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const canEdit = await checkUserCanEdit(userId, article.knowledgeBaseId);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to restore this article" });
      }
      
      const version = parseInt(req.params.version, 10);
      const revision = await storage.getRevisionByVersion(req.params.id, version);
      if (!revision) {
        return res.status(404).json({ message: "Revision not found" });
      }
      
      // Save current version as a revision before restoring
      const latestVersion = await storage.getLatestRevisionVersion(req.params.id);
      await storage.createRevision({
        articleId: req.params.id,
        version: latestVersion + 1,
        title: article.title,
        content: article.content,
        categoryId: article.categoryId,
        isPublic: article.isPublic,
        createdBy: userId,
      });
      
      // Restore the article from the revision
      const restoredArticle = await storage.updateArticle(req.params.id, {
        title: revision.title,
        content: revision.content,
        categoryId: revision.categoryId,
        isPublic: revision.isPublic,
      });
      
      res.json(restoredArticle);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getArticleById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const canManage = await checkUserCanManage(userId, existing.knowledgeBaseId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can delete articles" });
      }
      
      await storage.deleteArticle(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.json([]);
      }
      const categories = await storage.getCategoriesByKnowledgeBaseId(kb.id);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = (req.query.kbId as string) || req.body.knowledgeBaseId;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
      }

      const canEdit = await checkUserCanEdit(userId, kb.id);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to create categories" });
      }

      const category = await storage.createCategory({
        knowledgeBaseId: kb.id,
        name: req.body.name,
        description: req.body.description || null,
        order: req.body.order ?? 0,
      });
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/categories/reorder", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found" });
      }

      const canEdit = await checkUserCanEdit(userId, kb.id);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to reorder categories" });
      }

      const { categoryOrders } = req.body as { categoryOrders: { id: string; order: number }[] };
      if (!categoryOrders || !Array.isArray(categoryOrders)) {
        return res.status(400).json({ message: "categoryOrders array is required" });
      }

      const existingCategories = await storage.getCategoriesByKnowledgeBaseId(kb.id);
      const validCategoryIds = new Set(existingCategories.map(c => c.id));
      
      for (const { id } of categoryOrders) {
        if (!validCategoryIds.has(id)) {
          return res.status(403).json({ message: "Invalid category ID - category does not belong to your knowledge base" });
        }
      }

      await storage.reorderCategories(categoryOrders, kb.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getCategoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      const canEdit = await checkUserCanEdit(userId, existing.knowledgeBaseId);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to edit this category" });
      }
      
      const category = await storage.updateCategory(req.params.id, req.body);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getCategoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      const canManage = await checkUserCanManage(userId, existing.knowledgeBaseId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can delete categories" });
      }
      
      await storage.deleteCategory(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/views", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.json({ totalViews: 0, recentViews: [], viewsByDate: [] });
      }
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate as string);
        endDate = new Date(req.query.endDate as string);
      }
      
      const stats = await storage.getArticleViewStats(kb.id, startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/searches", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.json({ totalSearches: 0, recentSearches: [] });
      }
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate as string);
        endDate = new Date(req.query.endDate as string);
      }
      
      const stats = await storage.getSearchStats(kb.id, startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const viewStats = await storage.getArticleViewStats(kb.id);
      const searchStats = await storage.getSearchStats(kb.id);

      let csv = "Type,Item,Count\n";
      viewStats.recentViews.forEach((view: any) => {
        csv += `Article View,"${view.articleTitle}",${view.views}\n`;
      });
      searchStats.recentSearches.forEach((search: any) => {
        csv += `Search,"${search.query}",${search.count}\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="analytics-export.csv"');
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/analytics/views", async (req, res) => {
    try {
      const { articleId } = req.body;
      const article = await storage.getArticleById(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      await storage.trackArticleView({ articleId });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  async function getKnowledgeBaseByIdentifier(identifier: string): Promise<typeof import("@shared/schema").knowledgeBases.$inferSelect | undefined> {
    let kb = await storage.getKnowledgeBaseBySlug(identifier);
    if (!kb) {
      kb = await storage.getKnowledgeBaseByUserId(identifier);
    }
    return kb;
  }

  app.get("/api/kb/:identifier", async (req, res) => {
    try {
      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      res.json(kb);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:identifier/articles", async (req, res) => {
    try {
      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.json([]);
      }
      const articles = await storage.getArticlesByKnowledgeBaseId(kb.id);
      const publicArticles = articles.filter((a) => a.isPublic);
      res.json(publicArticles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:identifier/articles/:articleId", async (req, res) => {
    try {
      const article = await storage.getArticleById(req.params.articleId);
      if (!article || !article.isPublic) {
        return res.status(404).json({ message: "Article not found" });
      }
      res.json(article);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:identifier/categories", async (req, res) => {
    try {
      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.json([]);
      }
      const categories = await storage.getCategoriesByKnowledgeBaseId(kb.id);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:identifier/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.json([]);
      }

      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.json([]);
      }

      const articles = await storage.searchArticles(kb.id, query);
      res.json(articles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:identifier/search/:query", async (req, res) => {
    try {
      const query = req.params.query;
      if (!query) {
        return res.json([]);
      }

      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.json([]);
      }

      const articles = await storage.searchArticles(kb.id, query);
      res.json(articles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/kb/:identifier/search", async (req, res) => {
    try {
      const { query } = req.body;
      const kb = await getKnowledgeBaseByIdentifier(req.params.identifier);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      await storage.trackSearch({ knowledgeBaseId: kb.id, query });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/articles/:id/feedback", async (req, res) => {
    try {
      const { isHelpful } = req.body;
      await storage.submitArticleFeedback({
        articleId: req.params.id,
        isHelpful,
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/logos", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { logoURL } = req.body;
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(logoURL, {
        owner: userId,
        visibility: "public",
      });
      res.json({ objectPath });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/article-images", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { imageURL } = req.body;
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(imageURL, {
        owner: userId,
        visibility: "public",
      });
      res.json({ objectPath });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/objects/*", async (req, res) => {
    try {
      const userId = getUserId(req);
      const param = (req.params as Record<string, string>)[0] || "";
      const objectPath = `/objects/${param}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });

      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/team/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string | undefined;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.json([]);
      }
      const members = await storage.getTeamMembersByKnowledgeBaseId(kb.id);
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/team/invite", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = inviteSchema.parse(req.body);
      const kbId = (req.query.kbId as string) || req.body.knowledgeBaseId;
      const kb = await getSelectedKnowledgeBase(userId, kbId);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const userRole = await storage.getUserRole(userId, kb.id);
      if (!userRole || (userRole !== "owner" && userRole !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can invite members" });
      }

      const inviteToken = Math.random().toString(36).substring(2, 15);
      const member = await storage.createTeamMember({
        knowledgeBaseId: kb.id,
        invitedEmail: validatedData.email,
        role: validatedData.role,
        status: "pending",
        inviteToken,
        userId: null,
      });

      // Send invite email
      const inviter = await storage.getUser(userId);
      const inviterName = inviter?.firstName && inviter?.lastName 
        ? `${inviter.firstName} ${inviter.lastName}` 
        : inviter?.email || "A team member";
      
      // Build invite URL using the request host
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "";
      const inviteUrl = `${protocol}://${host}/invite/${inviteToken}`;

      const emailResult = await emailService.sendTeamInvite({
        toEmail: validatedData.email,
        inviterName,
        knowledgeBaseName: kb.siteTitle || "Knowledge Base",
        role: validatedData.role,
        inviteUrl,
      });

      res.json({ 
        ...member, 
        emailSent: emailResult.success,
        inviteUrl, // Include for manual sharing if email fails
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/team/:memberId/role", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = roleUpdateSchema.parse(req.body);
      const member = await storage.getTeamMemberById(req.params.memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const kb = await storage.getKnowledgeBaseById(member.knowledgeBaseId);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const userRole = await storage.getUserRole(userId, kb.id);
      if (!userRole || (userRole !== "owner" && userRole !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can update roles" });
      }

      const updated = await storage.updateTeamMember(req.params.memberId, { role: validatedData.role });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const member = await storage.getTeamMemberById(req.params.memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const kb = await storage.getKnowledgeBaseById(member.knowledgeBaseId);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const userRole = await storage.getUserRole(userId, kb.id);
      if (!userRole || (userRole !== "owner" && userRole !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can remove members" });
      }

      await storage.deleteTeamMember(req.params.memberId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/team/accept/:token", async (req, res) => {
    try {
      const member = await storage.getTeamMemberByToken(req.params.token);
      if (!member) {
        return res.status(404).json({ message: "Invalid invite token" });
      }
      res.json(member);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/team/accept/:token", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const member = await storage.getTeamMemberByToken(req.params.token);
      if (!member) {
        return res.status(404).json({ message: "Invalid invite token" });
      }

      const updated = await storage.updateTeamMember(member.id, {
        userId,
        status: "active",
        acceptedAt: new Date(),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============ INTEGRATIONS ROUTES ============

  function sanitizeIntegrationConfig(integration: any) {
    if (!integration) return integration;
    const config = { ...integration.config } as Record<string, unknown>;
    delete config.accessToken;
    delete config.webhookUrl;
    return { ...integration, config };
  }

  app.get("/api/integrations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can manage integrations" });
      }

      const integrations = await storage.getIntegrationsByKnowledgeBaseId(kbId);
      res.json(integrations.map(sanitizeIntegrationConfig));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/:type", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      const type = req.params.type;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can manage integrations" });
      }

      const integration = await storage.getIntegrationByType(kbId, type);
      res.json(sanitizeIntegrationConfig(integration) || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/integrations/:type", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      const type = req.params.type;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can manage integrations" });
      }

      const { enabled, config } = req.body;
      
      let integration = await storage.getIntegrationByType(kbId, type);
      
      if (integration) {
        integration = await storage.updateIntegration(integration.id, {
          enabled: enabled ?? integration.enabled,
          config: config ?? integration.config,
        });
      } else {
        integration = await storage.createIntegration({
          knowledgeBaseId: kbId,
          type,
          enabled: enabled ?? false,
          config: config ?? {},
        });
      }

      res.json(integration);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/integrations/:type", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      const type = req.params.type;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can manage integrations" });
      }

      const integration = await storage.getIntegrationByType(kbId, type);
      if (integration) {
        await storage.deleteIntegration(integration.id);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ServiceNow-specific routes
  app.post("/api/integrations/servicenow/test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can test integrations" });
      }

      const credentials = getServiceNowCredentials();
      if (!credentials) {
        return res.status(400).json({ 
          success: false, 
          message: "ServiceNow credentials not configured. Please add SERVICENOW_USERNAME and SERVICENOW_PASSWORD secrets." 
        });
      }

      const { instanceUrl } = req.body;
      if (!instanceUrl) {
        return res.status(400).json({ success: false, message: "Instance URL is required" });
      }

      const service = new ServiceNowService(instanceUrl, credentials);
      const result = await service.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/integrations/servicenow/knowledge-bases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can access integrations" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'servicenow');
      if (!integration?.config) {
        return res.status(400).json({ message: "ServiceNow integration not configured" });
      }

      const credentials = getServiceNowCredentials();
      if (!credentials) {
        return res.status(400).json({ message: "ServiceNow credentials not configured" });
      }

      const config = integration.config as { instanceUrl?: string };
      if (!config.instanceUrl) {
        return res.status(400).json({ message: "ServiceNow instance URL not configured" });
      }

      const service = new ServiceNowService(config.instanceUrl, credentials);
      const knowledgeBases = await service.getKnowledgeBases();
      res.json(knowledgeBases);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/servicenow/sync", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      
      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      const canManage = await checkUserCanManage(userId, kbId);
      if (!canManage) {
        return res.status(403).json({ message: "Only owners and admins can sync integrations" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'servicenow');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "ServiceNow integration not enabled" });
      }

      const credentials = getServiceNowCredentials();
      if (!credentials) {
        return res.status(400).json({ message: "ServiceNow credentials not configured" });
      }

      const config = integration.config as { instanceUrl?: string; knowledgeBaseId?: string };
      if (!config.instanceUrl || !config.knowledgeBaseId) {
        return res.status(400).json({ message: "ServiceNow integration not fully configured" });
      }

      const articles = await storage.getArticlesByKnowledgeBaseId(kbId);
      const publicArticles = articles.filter(a => a.isPublic);

      const service = new ServiceNowService(config.instanceUrl, credentials);
      const result = await service.syncArticles(publicArticles, config.knowledgeBaseId);

      await storage.updateIntegration(integration.id, { lastSyncAt: new Date() } as any);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public endpoint to get ServiceNow incident form URL for an article
  app.get("/api/kb/:identifier/articles/:articleId/incident-form", async (req, res) => {
    try {
      const { identifier, articleId } = req.params;
      
      let kb = await storage.getKnowledgeBaseBySlug(identifier);
      if (!kb) {
        kb = await storage.getKnowledgeBaseById(identifier);
      }
      
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const article = await storage.getArticleById(articleId);
      if (!article || !article.isPublic || article.knowledgeBaseId !== kb.id) {
        return res.status(404).json({ message: "Article not found" });
      }

      const integration = await storage.getIntegrationByType(kb.id, 'servicenow');
      if (!integration?.enabled) {
        return res.status(404).json({ message: "ServiceNow integration not enabled", available: false });
      }

      const config = integration.config as { instanceUrl?: string; incidentFormEnabled?: boolean };
      if (!config.incidentFormEnabled || !config.instanceUrl) {
        return res.status(404).json({ message: "Incident form not enabled", available: false });
      }

      const articleUrl = `${req.protocol}://${req.get('host')}/kb/${kb.slug}/articles/${article.id}`;
      
      const credentials = getServiceNowCredentials();
      if (credentials) {
        const service = new ServiceNowService(config.instanceUrl, credentials);
        const formUrl = service.generateIncidentFormUrl(article.title, articleUrl);
        res.json({ available: true, formUrl });
      } else {
        const params = new URLSearchParams({
          sysparm_query: `short_description=Help needed: ${article.title}`,
        });
        res.json({ 
          available: true, 
          formUrl: `${config.instanceUrl}/incident.do?${params.toString()}` 
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ SLACK INTEGRATION ROUTES ============

  // Slack OAuth initiation
  app.get("/api/integrations/slack/oauth/url", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure Slack" });
      }

      const credentials = getSlackCredentials();
      if (!credentials) {
        return res.status(400).json({ 
          message: "Slack credentials not configured. Add SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET secrets." 
        });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/slack/oauth/callback`;
      const service = new SlackService(credentials);
      const oauthUrl = service.getOAuthUrl(kbId, redirectUri);

      res.json({ url: oauthUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Slack OAuth callback
  app.get("/api/integrations/slack/oauth/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        return res.redirect(`/integrations?slack_error=${encodeURIComponent(oauthError as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/integrations?slack_error=missing_params");
      }

      let kbId: string;
      try {
        const decoded = JSON.parse(Buffer.from(state as string, 'base64').toString());
        kbId = decoded.kbId;
      } catch {
        return res.redirect("/integrations?slack_error=invalid_state");
      }

      const credentials = getSlackCredentials();
      if (!credentials) {
        return res.redirect("/integrations?slack_error=credentials_not_configured");
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/slack/oauth/callback`;
      const service = new SlackService(credentials);
      const tokenResponse = await service.exchangeCodeForToken(code as string, redirectUri);

      if (!tokenResponse.ok) {
        return res.redirect(`/integrations?slack_error=${encodeURIComponent(tokenResponse.error || 'oauth_failed')}`);
      }

      const config: Record<string, unknown> = {
        teamId: tokenResponse.team?.id,
        teamName: tokenResponse.team?.name,
        accessToken: tokenResponse.access_token,
        slashCommandEnabled: true,
        notifyOnPublish: false,
      };

      if (tokenResponse.incoming_webhook) {
        config.channelId = tokenResponse.incoming_webhook.channel_id;
        config.channelName = tokenResponse.incoming_webhook.channel;
        config.webhookUrl = tokenResponse.incoming_webhook.url;
      }

      const existing = await storage.getIntegrationByType(kbId, 'slack');
      if (existing) {
        await storage.updateIntegration(existing.id, {
          enabled: true,
          config,
        });
      } else {
        await storage.createIntegration({
          knowledgeBaseId: kbId,
          type: 'slack',
          enabled: true,
          config,
        });
      }

      res.redirect("/integrations?slack_success=true");
    } catch (error: any) {
      console.error("Slack OAuth error:", error);
      res.redirect(`/integrations?slack_error=${encodeURIComponent(error.message)}`);
    }
  });

  // Slack disconnect
  app.post("/api/integrations/slack/disconnect", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can disconnect Slack" });
      }

      const existing = await storage.getIntegrationByType(kbId, 'slack');
      if (existing) {
        await storage.updateIntegration(existing.id, {
          enabled: false,
          config: {},
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Slack config update (for toggling features only - protects sensitive credentials)
  app.put("/api/integrations/slack/config", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure Slack" });
      }

      const existing = await storage.getIntegrationByType(kbId, 'slack');
      if (!existing) {
        return res.status(404).json({ message: "Slack integration not found" });
      }

      const allowedUpdates = slackConfigSchema.pick({
        slashCommandEnabled: true,
        notifyOnPublish: true,
      }).partial().parse(req.body);

      const existingConfig = existing.config as Record<string, unknown>;
      const newConfig = { ...existingConfig, ...allowedUpdates };

      await storage.updateIntegration(existing.id, { config: newConfig });

      const updated = await storage.getIntegrationByType(kbId, 'slack');
      
      const safeConfig = { ...updated?.config } as Record<string, unknown>;
      delete safeConfig.accessToken;
      delete safeConfig.webhookUrl;
      
      res.json({ ...updated, config: safeConfig });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Slack slash command webhook (public endpoint)
  app.post("/api/slack/commands", async (req, res) => {
    try {
      const credentials = getSlackCredentials();
      if (!credentials) {
        return res.status(500).json({ text: "Slack integration not configured" });
      }

      const signature = req.headers['x-slack-signature'] as string;
      const timestamp = req.headers['x-slack-request-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({ text: "Missing signature" });
      }

      const service = new SlackService(credentials);
      
      const bodyString = typeof req.body === 'string' 
        ? req.body 
        : new URLSearchParams(req.body).toString();

      if (!service.verifySlackRequest(signature, timestamp, bodyString)) {
        return res.status(401).json({ text: "Invalid signature" });
      }

      const { team_id, text } = req.body;
      const { action, query } = service.parseSlashCommand(text || '');

      if (action === 'help' || !query) {
        return res.json(service.formatHelpMessage());
      }

      const integrations = await storage.getIntegrationsByType('slack');
      const integration = integrations.find(i => {
        const config = i.config as { teamId?: string; slashCommandEnabled?: boolean };
        return config.teamId === team_id && config.slashCommandEnabled !== false;
      });

      if (!integration) {
        return res.json({
          response_type: "ephemeral",
          text: "This Slack workspace is not connected to a knowledge base.",
        });
      }

      const kb = await storage.getKnowledgeBaseById(integration.knowledgeBaseId);
      if (!kb) {
        return res.json({
          response_type: "ephemeral",
          text: "Knowledge base not found.",
        });
      }

      const articles = await storage.searchPublicArticles(kb.id, query);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const response = service.formatSearchResults(articles, query, kb.slug, baseUrl);

      res.json(response);
    } catch (error: any) {
      console.error("Slack command error:", error);
      res.json({
        response_type: "ephemeral",
        text: `Error processing command: ${error.message}`,
      });
    }
  });

  // Test notification endpoint
  app.post("/api/integrations/slack/test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can test Slack" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'slack');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "Slack integration not enabled" });
      }

      const config = integration.config as { accessToken?: string; channelId?: string; webhookUrl?: string };
      
      if (config.webhookUrl) {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: "Test notification from your Knowledge Base!",
          }),
        });

        if (response.ok) {
          res.json({ success: true, message: "Test message sent!" });
        } else {
          res.json({ success: false, message: "Failed to send test message" });
        }
      } else if (config.accessToken && config.channelId) {
        const credentials = getSlackCredentials();
        if (!credentials) {
          return res.status(400).json({ message: "Slack credentials not configured" });
        }

        const service = new SlackService(credentials, config.accessToken);
        const result = await service.postMessage(config.channelId, {
          text: "Test notification from your Knowledge Base!",
        });

        res.json({ 
          success: result.ok, 
          message: result.ok ? "Test message sent!" : result.error 
        });
      } else {
        res.status(400).json({ message: "No channel configured for notifications" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}

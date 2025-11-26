import type { Express, Request } from "express";
import { isAuthenticated } from "./replitAuth";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertKnowledgeBaseSchema, insertArticleSchema, insertCategorySchema, insertTeamMemberSchema } from "@shared/schema";
import { z } from "zod";

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
      const kbs = await storage.getKnowledgeBasesByUserId(userId);
      res.json(kbs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertKnowledgeBaseSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse({
        ...req.body,
        userId,
      });
      const kb = await storage.createKnowledgeBase(validatedData);
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
      console.log("[DEBUG] KB Update - Received body:", JSON.stringify(req.body));
      const kb = await storage.updateKnowledgeBase(req.params.id, req.body);
      console.log("[DEBUG] KB Update - Saved KB:", JSON.stringify(kb));
      res.json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kb = await storage.getKnowledgeBaseForUser(userId);
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
      }

      const canEdit = await checkUserCanEdit(userId, kb.id);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to create articles" });
      }

      const validatedData = insertArticleSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse({
        ...req.body,
        knowledgeBaseId: kb.id,
      });
      const article = await storage.createArticle(validatedData);
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
      
      const article = await storage.updateArticle(req.params.id, req.body);
      res.json(article);
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
      }

      const canEdit = await checkUserCanEdit(userId, kb.id);
      if (!canEdit) {
        return res.status(403).json({ message: "You don't have permission to create categories" });
      }

      const validatedData = insertCategorySchema.omit({ id: true, createdAt: true, updatedAt: true }).parse({
        ...req.body,
        knowledgeBaseId: kb.id,
        order: 0,
      });
      const category = await storage.createCategory(validatedData);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
      if (!kb) {
        return res.json({ totalSearches: 0, recentSearches: [] });
      }
      const stats = await storage.getSearchStats(kb.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kb = await storage.getKnowledgeBaseForUser(userId);
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

  app.get("/api/kb/:userId", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBaseByUserId(req.params.userId);
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }
      res.json(kb);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:userId/articles", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBaseByUserId(req.params.userId);
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

  app.get("/api/kb/:userId/articles/:articleId", async (req, res) => {
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

  app.get("/api/kb/:userId/categories", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBaseByUserId(req.params.userId);
      if (!kb) {
        return res.json([]);
      }
      const categories = await storage.getCategoriesByKnowledgeBaseId(kb.id);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/kb/:userId/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.json([]);
      }

      const kb = await storage.getKnowledgeBaseByUserId(req.params.userId);
      if (!kb) {
        return res.json([]);
      }

      const articles = await storage.searchArticles(kb.id, query);
      res.json(articles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/kb/:userId/search", async (req, res) => {
    try {
      const { query } = req.body;
      const kb = await storage.getKnowledgeBaseByUserId(req.params.userId);
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

  app.get("/objects/*", async (req, res) => {
    try {
      const userId = getUserId(req);
      const objectPath = `/objects/${req.params[0]}`;
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
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
      const kb = await storage.getKnowledgeBaseForUser(userId);
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
      res.json(member);
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
}

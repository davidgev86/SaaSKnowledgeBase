import type { Express, Request } from "express";
import { isAuthenticated } from "./replitAuth";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertKnowledgeBaseSchema, insertArticleSchema, insertCategorySchema } from "@shared/schema";
import { z } from "zod";

const objectStorageService = new ObjectStorageService();

function getUserId(req: Request): string {
  const user = req.user as any;
  return user?.claims?.sub;
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
      const kb = await storage.updateKnowledgeBase(req.params.id, req.body);
      res.json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kb = await storage.getKnowledgeBaseByUserId(userId);
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
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      res.json(article);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getArticleById(req.params.id);
      if (!existing || existing.knowledgeBaseId !== kb.id) {
        return res.status(403).json({ message: "Forbidden" });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getArticleById(req.params.id);
      if (!existing || existing.knowledgeBaseId !== kb.id) {
        return res.status(403).json({ message: "Forbidden" });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(400).json({ message: "Knowledge base not found. Create one first." });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getCategoryById(req.params.id);
      if (!existing || existing.knowledgeBaseId !== kb.id) {
        return res.status(403).json({ message: "Forbidden" });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getCategoryById(req.params.id);
      if (!existing || existing.knowledgeBaseId !== kb.id) {
        return res.status(403).json({ message: "Forbidden" });
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
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.json({ totalViews: 0, recentViews: [] });
      }
      const stats = await storage.getArticleViewStats(kb.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/searches", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kb = await storage.getKnowledgeBaseByUserId(userId);
      if (!kb) {
        return res.json({ totalSearches: 0, recentSearches: [] });
      }
      const stats = await storage.getSearchStats(kb.id);
      res.json(stats);
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
      const objectPath = `/${req.params[0]}`;
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
}

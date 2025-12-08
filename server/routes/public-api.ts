import { Router } from "express";
import { storage } from "../storage";
import { apiKeyAuth, AuthenticatedApiRequest } from "../services/api-auth";

const router = Router();

router.get("/articles", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const { category_id, is_public, limit = "50", offset = "0" } = req.query;
    
    const allArticles = await storage.getArticlesByKnowledgeBaseId(kbId);
    
    let filtered = allArticles;
    
    if (category_id) {
      filtered = filtered.filter(a => a.categoryId === category_id);
    }
    
    if (is_public !== undefined) {
      const isPublicBool = is_public === "true";
      filtered = filtered.filter(a => a.isPublic === isPublicBool);
    }
    
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;
    
    const paginated = filtered.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      data: paginated.map(article => ({
        id: article.id,
        title: article.title,
        content: article.content,
        categoryId: article.categoryId,
        isPublic: article.isPublic,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      })),
      pagination: {
        total: filtered.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < filtered.length,
      },
    });
  } catch (error) {
    console.error("Public API articles error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch articles" });
  }
});

router.get("/articles/:id", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const article = await storage.getArticleById(req.params.id);
    
    if (!article || article.knowledgeBaseId !== kbId) {
      return res.status(404).json({ error: "not_found", message: "Article not found" });
    }
    
    res.json({
      data: {
        id: article.id,
        title: article.title,
        content: article.content,
        categoryId: article.categoryId,
        isPublic: article.isPublic,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      },
    });
  } catch (error) {
    console.error("Public API article error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch article" });
  }
});

router.get("/categories", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const categories = await storage.getCategoriesByKnowledgeBaseId(kbId);
    
    res.json({
      data: categories.map(category => ({
        id: category.id,
        name: category.name,
        order: category.order,
      })),
    });
  } catch (error) {
    console.error("Public API categories error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch categories" });
  }
});

router.get("/categories/:id", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const category = await storage.getCategoryById(req.params.id);
    
    if (!category || category.knowledgeBaseId !== kbId) {
      return res.status(404).json({ error: "not_found", message: "Category not found" });
    }
    
    res.json({
      data: {
        id: category.id,
        name: category.name,
        order: category.order,
      },
    });
  } catch (error) {
    console.error("Public API category error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch category" });
  }
});

router.get("/search", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const { q, is_public, limit = "20" } = req.query;
    
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "bad_request", message: "Query parameter 'q' is required" });
    }
    
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    
    const articles = await storage.searchArticles(kbId, q);
    
    let filtered = articles;
    if (is_public !== undefined) {
      const isPublicBool = is_public === "true";
      filtered = filtered.filter(a => a.isPublic === isPublicBool);
    }
    
    const results = filtered.slice(0, limitNum);
    
    res.json({
      data: results.map(article => ({
        id: article.id,
        title: article.title,
        content: article.content,
        categoryId: article.categoryId,
        isPublic: article.isPublic,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      })),
      query: q,
      total: results.length,
    });
  } catch (error) {
    console.error("Public API search error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to search articles" });
  }
});

router.get("/knowledge-base", apiKeyAuth(["read"]), async (req: AuthenticatedApiRequest, res) => {
  try {
    const kbId = req.kbId!;
    const kb = await storage.getKnowledgeBaseById(kbId);
    
    if (!kb) {
      return res.status(404).json({ error: "not_found", message: "Knowledge base not found" });
    }
    
    res.json({
      data: {
        id: kb.id,
        title: kb.siteTitle || "Knowledge Base",
        slug: kb.slug,
        primaryColor: kb.primaryColor,
      },
    });
  } catch (error) {
    console.error("Public API knowledge base error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch knowledge base" });
  }
});

export default router;

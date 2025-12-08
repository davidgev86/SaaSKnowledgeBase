import type { Express, Request } from "express";
import { isAuthenticated } from "./replitAuth";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertKnowledgeBaseSchema, insertArticleSchema, insertCategorySchema, insertTeamMemberSchema, serviceNowConfigSchema, slackConfigSchema, ssoConfigSchema, SSOConfig, TeamsConfig, HelpdeskConfig } from "@shared/schema";
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

      // Send publish notifications if article was just made public
      const wasJustPublished = !existing.isPublic && article.isPublic;
      if (wasJustPublished) {
        const kb = await storage.getKnowledgeBaseById(article.knowledgeBaseId);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const publicUrl = kb?.slug ? `${baseUrl}/kb/${kb.slug}/articles/${article.id}` : null;
        
        // Notify Slack if configured
        try {
          const slackIntegration = await storage.getIntegrationByType(article.knowledgeBaseId, 'slack');
          if (slackIntegration?.enabled) {
            const slackConfig = slackIntegration.config as Record<string, unknown>;
            if (slackConfig.notifyOnPublish && slackConfig.accessToken && slackConfig.channelId) {
              const { SlackService } = await import("./services/slack");
              const slackService = new SlackService(slackConfig.accessToken as string);
              await slackService.sendMessage(
                slackConfig.channelId as string,
                `A new article has been published: *${article.title}*${publicUrl ? `\n<${publicUrl}|View article>` : ''}`
              );
              console.log("[Slack notify] Published article notification sent");
            }
          }
        } catch (slackErr: any) {
          console.error("[Slack notify] Failed to send publish notification:", slackErr.message);
        }

        // Notify Teams if configured
        try {
          const teamsIntegration = await storage.getIntegrationByType(article.knowledgeBaseId, 'teams');
          if (teamsIntegration?.enabled) {
            const teamsConfig = teamsIntegration.config as TeamsConfig;
            if (teamsConfig.notifyOnPublish && kb) {
              const { getTeamsCredentials, TeamsService } = await import("./services/teams");
              const credentials = getTeamsCredentials();
              if (credentials && (teamsConfig.channelId || teamsConfig.webhookUrl)) {
                const teamsService = new TeamsService(credentials, teamsConfig);
                const richCard = teamsService.formatArticlePublishedCard(article, kb, baseUrl);
                
                if (teamsConfig.webhookUrl) {
                  await teamsService.postToWebhook(teamsConfig.webhookUrl, richCard);
                } else if (teamsConfig.teamId && teamsConfig.channelId) {
                  await teamsService.sendChannelMessage(teamsConfig.teamId, teamsConfig.channelId, richCard);
                }
                console.log("[Teams notify] Published article notification sent");
              }
            }
          }
        } catch (teamsErr: any) {
          console.error("[Teams notify] Failed to send publish notification:", teamsErr.message);
        }
      }

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
    delete config.oidcClientSecret;
    delete config.samlCertificate;
    return { ...integration, config };
  }

  function sanitizeHelpdeskConfig(integration: any) {
    if (!integration) return integration;
    const config = { ...integration.config } as Record<string, unknown>;
    delete config.apiToken;
    delete config.apiKey;
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

  // ============ MICROSOFT TEAMS INTEGRATION ROUTES ============

  // Get Teams configuration
  app.get("/api/integrations/teams", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view Teams settings" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      res.json(sanitizeIntegrationConfig(integration) || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Teams OAuth initiation
  app.get("/api/integrations/teams/oauth/url", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can connect Teams" });
      }

      const { getTeamsCredentials, TeamsService } = await import("./services/teams");
      const credentials = getTeamsCredentials();
      if (!credentials) {
        return res.status(400).json({ 
          message: "Teams credentials not configured. Set TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, and TEAMS_TENANT_ID." 
        });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/teams/oauth/callback`;
      const service = new TeamsService(credentials, { searchEnabled: false, notifyOnPublish: false });
      const oauthUrl = service.getOAuthUrl(kbId, redirectUri);

      res.json({ url: oauthUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Teams OAuth callback
  app.get("/api/integrations/teams/oauth/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        return res.redirect(`/integrations?tab=teams&error=${encodeURIComponent(oauthError as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/integrations?tab=teams&error=Invalid+callback+parameters");
      }

      const { getTeamsCredentials, TeamsService } = await import("./services/teams");
      const credentials = getTeamsCredentials();
      if (!credentials) {
        return res.redirect("/integrations?tab=teams&error=Teams+not+configured");
      }

      const service = new TeamsService(credentials, { searchEnabled: false, notifyOnPublish: false });
      const stateData = service.parseState(state as string);
      
      if (!stateData) {
        return res.redirect("/integrations?tab=teams&error=Invalid+state");
      }

      const kbId = stateData.kbId;
      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/teams/oauth/callback`;
      const tokenResponse = await service.exchangeCodeForToken(code as string, redirectUri);

      if (!tokenResponse) {
        return res.redirect("/integrations?tab=teams&error=Token+exchange+failed");
      }

      const teamsConfig: TeamsConfig = {
        clientId: credentials.clientId,
        tenantId: credentials.tenantId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: Date.now() + tokenResponse.expires_in * 1000,
        searchEnabled: false,
        notifyOnPublish: false,
      };

      let integration = await storage.getIntegrationByType(kbId, 'teams');

      if (integration) {
        await storage.updateIntegration(integration.id, {
          enabled: true,
          config: teamsConfig,
        });
      } else {
        await storage.createIntegration({
          knowledgeBaseId: kbId,
          type: 'teams',
          enabled: true,
          config: teamsConfig,
        });
      }

      res.redirect("/integrations?tab=teams&success=connected");
    } catch (error: any) {
      console.error("Teams OAuth callback error:", error);
      res.redirect(`/integrations?tab=teams&error=${encodeURIComponent(error.message)}`);
    }
  });

  // Get available teams for connected account
  app.get("/api/integrations/teams/teams", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can manage Teams" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "Teams not connected" });
      }

      const config = integration.config as TeamsConfig;
      const { createTeamsService } = await import("./services/teams");
      const service = createTeamsService(config);
      
      if (!service) {
        return res.status(400).json({ message: "Teams credentials not configured" });
      }

      const teams = await service.getJoinedTeams();
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get channels for a team
  app.get("/api/integrations/teams/channels", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;
      const teamId = req.query.teamId as string;

      if (!kbId || !teamId) {
        return res.status(400).json({ message: "Knowledge base ID and team ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can manage Teams" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "Teams not connected" });
      }

      const config = integration.config as TeamsConfig;
      const { createTeamsService } = await import("./services/teams");
      const service = createTeamsService(config);
      
      if (!service) {
        return res.status(400).json({ message: "Teams credentials not configured" });
      }

      const channels = await service.getTeamChannels(teamId);
      res.json(channels);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update Teams configuration
  app.put("/api/integrations/teams/config", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure Teams" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      if (!integration) {
        return res.status(400).json({ message: "Teams not connected" });
      }

      const { teamId, teamName, channelId, channelName, webhookUrl, searchEnabled, notifyOnPublish } = req.body;
      
      const existingConfig = integration.config as TeamsConfig;
      const updatedConfig: TeamsConfig = {
        ...existingConfig,
        teamId: teamId ?? existingConfig.teamId,
        teamName: teamName ?? existingConfig.teamName,
        channelId: channelId ?? existingConfig.channelId,
        channelName: channelName ?? existingConfig.channelName,
        webhookUrl: webhookUrl ?? existingConfig.webhookUrl,
        searchEnabled: searchEnabled ?? existingConfig.searchEnabled,
        notifyOnPublish: notifyOnPublish ?? existingConfig.notifyOnPublish,
      };

      const updated = await storage.updateIntegration(integration.id, {
        config: updatedConfig,
      });

      res.json(sanitizeIntegrationConfig(updated));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Save Teams webhook URL (creates integration if it doesn't exist)
  app.put("/api/integrations/teams/webhook", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure Teams" });
      }

      const { webhookUrl } = req.body;
      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return res.status(400).json({ message: "Webhook URL is required" });
      }

      let integration = await storage.getIntegrationByType(kbId, 'teams');
      
      if (integration) {
        const existingConfig = integration.config as TeamsConfig;
        const updated = await storage.updateIntegration(integration.id, {
          config: { ...existingConfig, webhookUrl, notifyOnPublish: true },
        });
        res.json(sanitizeIntegrationConfig(updated));
      } else {
        const webhookConfig: TeamsConfig = {
          webhookUrl,
          searchEnabled: false,
          notifyOnPublish: true,
        };
        const created = await storage.createIntegration({
          knowledgeBaseId: kbId,
          type: 'teams',
          enabled: true,
          config: webhookConfig,
        });
        res.json(sanitizeIntegrationConfig(created));
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Teams disconnect
  app.post("/api/integrations/teams/disconnect", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can disconnect Teams" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      if (integration) {
        await storage.deleteIntegration(integration.id);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Test Teams connection
  app.post("/api/integrations/teams/test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can test Teams" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'teams');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "Teams integration not enabled" });
      }

      const config = integration.config as TeamsConfig;
      const { createTeamsService } = await import("./services/teams");
      const service = createTeamsService(config);
      
      if (!service) {
        return res.status(400).json({ message: "Teams credentials not configured" });
      }

      const testCard = {
        type: "AdaptiveCard" as const,
        version: "1.4",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body: [
          {
            type: "TextBlock",
            text: "Test Notification",
            weight: "Bolder",
            size: "Large",
          },
          {
            type: "TextBlock",
            text: "This is a test notification from your Knowledge Base!",
            wrap: true,
          },
        ],
      };

      if (config.webhookUrl) {
        const result = await service.postToWebhook(config.webhookUrl, testCard);
        res.json({ 
          success: result.success, 
          message: result.success ? "Test message sent!" : result.error 
        });
      } else if (config.teamId && config.channelId) {
        const result = await service.sendChannelMessage(config.teamId, config.channelId, testCard);
        res.json({ 
          success: result.success, 
          message: result.success ? "Test message sent!" : result.error 
        });
      } else {
        res.status(400).json({ message: "No channel or webhook configured for notifications" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ SSO INTEGRATION ROUTES ============

  // Get SSO configuration
  app.get("/api/integrations/sso", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view SSO settings" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'sso');
      res.json(sanitizeIntegrationConfig(integration) || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Save/update SSO configuration
  app.put("/api/integrations/sso", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure SSO" });
      }

      const { enabled, config } = req.body;
      const ssoConfig = ssoConfigSchema.partial().parse(config || {});

      let integration = await storage.getIntegrationByType(kbId, 'sso');

      if (integration) {
        const existingConfig = integration.config as Record<string, unknown>;
        const mergedConfig = { ...existingConfig, ...ssoConfig };
        
        integration = await storage.updateIntegration(integration.id, {
          enabled: enabled ?? integration.enabled,
          config: mergedConfig,
        });
      } else {
        integration = await storage.createIntegration({
          knowledgeBaseId: kbId,
          type: 'sso',
          enabled: enabled ?? false,
          config: ssoConfig,
        });
      }

      res.json(sanitizeIntegrationConfig(integration));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Test SSO connection
  app.post("/api/integrations/sso/test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can test SSO" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'sso');
      if (!integration) {
        return res.status(404).json({ message: "SSO not configured" });
      }

      const config = integration.config as SSOConfig;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const { createSSOService } = await import("./services/sso");
      const service = createSSOService(config, `${baseUrl}/api/sso/callback`);

      const result = await service.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Initiate SSO login flow
  app.get("/api/sso/login/:kbId", async (req, res) => {
    try {
      const { kbId } = req.params;
      const kb = await storage.getKnowledgeBaseById(kbId);
      
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'sso');
      if (!integration?.enabled) {
        return res.status(400).json({ message: "SSO not enabled for this knowledge base" });
      }

      const config = integration.config as SSOConfig;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const { createSSOService } = await import("./services/sso");
      
      if (config.provider === 'oidc') {
        const service = createSSOService(config, `${baseUrl}/api/sso/callback/oidc`);
        const authUrl = await service.getOIDCAuthUrl(kbId);
        
        if (!authUrl) {
          return res.status(500).json({ message: "Failed to generate SSO login URL" });
        }
        
        res.redirect(authUrl);
      } else if (config.provider === 'saml') {
        const service = createSSOService(config, `${baseUrl}/api/sso/callback/saml`);
        const authUrl = service.getSAMLAuthUrl(kbId);
        
        if (!authUrl) {
          return res.status(500).json({ message: "Failed to generate SAML login URL" });
        }
        
        res.redirect(authUrl);
      } else {
        res.status(400).json({ message: "Invalid SSO provider configuration" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // OIDC callback handler
  app.get("/api/sso/callback/oidc", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        return res.redirect(`/login?error=${encodeURIComponent(error_description as string || error as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/login?error=Invalid+SSO+response");
      }

      const { createSSOService } = await import("./services/sso");
      const stateData = createSSOService({ provider: 'oidc' } as SSOConfig, "").parseState(state as string);
      
      if (!stateData) {
        return res.redirect("/login?error=Invalid+state+parameter");
      }

      const integration = await storage.getIntegrationByType(stateData.kbId, 'sso');
      if (!integration?.enabled) {
        return res.redirect("/login?error=SSO+not+enabled");
      }

      const config = integration.config as SSOConfig;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const service = createSSOService(config, `${baseUrl}/api/sso/callback/oidc`);

      const tokens = await service.exchangeOIDCCode(code as string);
      if (!tokens) {
        return res.redirect("/login?error=Failed+to+authenticate");
      }

      const userInfo = await service.getOIDCUserInfo(tokens.access_token);
      if (!userInfo || !userInfo.email) {
        return res.redirect("/login?error=Failed+to+get+user+info");
      }

      if (!service.isEmailDomainAllowed(userInfo.email)) {
        return res.redirect("/login?error=Email+domain+not+allowed");
      }

      let user = await storage.getUserByEmail(userInfo.email);
      
      if (!user && config.autoProvision) {
        user = await storage.upsertUser({
          email: userInfo.email,
          firstName: userInfo.given_name || userInfo.name?.split(' ')[0],
          lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' '),
          profileImageUrl: userInfo.picture,
        });

        if (user) {
          await storage.createTeamMember({
            knowledgeBaseId: stateData.kbId,
            userId: user.id,
            invitedEmail: userInfo.email,
            role: config.defaultRole || 'viewer',
            status: 'active',
          });
        }
      }

      if (!user) {
        return res.redirect("/login?error=User+provisioning+failed");
      }

      if (req.session) {
        (req.session as any).userId = user.id;
        (req.session as any).email = user.email;
      }

      const kb = await storage.getKnowledgeBaseById(stateData.kbId);
      res.redirect(kb ? `/kb/${kb.slug}` : '/');
    } catch (error: any) {
      console.error("OIDC callback error:", error);
      res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
  });

  // SAML callback handler (POST)
  app.post("/api/sso/callback/saml", async (req, res) => {
    try {
      const { SAMLResponse, RelayState } = req.body;

      if (!SAMLResponse || !RelayState) {
        return res.redirect("/login?error=Invalid+SAML+response");
      }

      const { createSSOService } = await import("./services/sso");
      const stateData = createSSOService({ provider: 'saml' } as SSOConfig, "").parseState(RelayState);
      
      if (!stateData) {
        return res.redirect("/login?error=Invalid+relay+state");
      }

      const integration = await storage.getIntegrationByType(stateData.kbId, 'sso');
      if (!integration?.enabled) {
        return res.redirect("/login?error=SSO+not+enabled");
      }

      const config = integration.config as SSOConfig;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const service = createSSOService(config, `${baseUrl}/api/sso/callback/saml`);

      const signatureResult = service.verifySAMLSignature(SAMLResponse);
      if (!signatureResult.valid) {
        console.error("SAML signature verification failed:", signatureResult.error);
        return res.redirect(`/login?error=${encodeURIComponent(signatureResult.error || "SAML+verification+failed")}`);
      }

      const assertion = service.parseSAMLResponse(SAMLResponse);
      if (!assertion) {
        return res.redirect("/login?error=Failed+to+parse+SAML+response");
      }

      const email = assertion.nameId;
      if (!email || !email.includes('@')) {
        return res.redirect("/login?error=Invalid+email+in+SAML+response");
      }

      if (!service.isEmailDomainAllowed(email)) {
        return res.redirect("/login?error=Email+domain+not+allowed");
      }

      const firstName = (assertion.attributes['firstName'] || assertion.attributes['givenName'] || '') as string;
      const lastName = (assertion.attributes['lastName'] || assertion.attributes['surname'] || '') as string;

      let user = await storage.getUserByEmail(email);
      
      if (!user && config.autoProvision) {
        user = await storage.upsertUser({
          email,
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
        });

        if (user) {
          await storage.createTeamMember({
            knowledgeBaseId: stateData.kbId,
            userId: user.id,
            invitedEmail: email,
            role: config.defaultRole || 'viewer',
            status: 'active',
          });
        }
      }

      if (!user) {
        return res.redirect("/login?error=User+provisioning+failed");
      }

      if (req.session) {
        (req.session as any).userId = user.id;
        (req.session as any).email = user.email;
      }

      const kb = await storage.getKnowledgeBaseById(stateData.kbId);
      res.redirect(kb ? `/kb/${kb.slug}` : '/');
    } catch (error: any) {
      console.error("SAML callback error:", error);
      res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
  });

  // Get SP metadata for SAML configuration
  app.get("/api/sso/metadata/:kbId", async (req, res) => {
    try {
      const { kbId } = req.params;
      const kb = await storage.getKnowledgeBaseById(kbId);
      
      if (!kb) {
        return res.status(404).json({ message: "Knowledge base not found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const { createSSOService } = await import("./services/sso");
      const service = createSSOService({ provider: 'saml' } as SSOConfig, `${baseUrl}/api/sso/callback/saml`);
      
      const metadata = service.getServiceProviderMetadata(kbId, baseUrl);
      
      res.set('Content-Type', 'application/xml');
      res.send(metadata);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ HELPDESK (ZENDESK/FRESHDESK) INTEGRATION ROUTES ============

  // Get helpdesk integration config
  app.get("/api/integrations/helpdesk", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view helpdesk settings" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      res.json(sanitizeHelpdeskConfig(integration) || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Save/update helpdesk configuration
  app.put("/api/integrations/helpdesk", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can configure helpdesk" });
      }

      const { enabled, config } = req.body;
      const { helpdeskConfigSchema } = await import("@shared/schema");
      const helpdeskConfig = helpdeskConfigSchema.partial().parse(config || {});

      let integration = await storage.getIntegrationByType(kbId, 'helpdesk');

      if (integration) {
        const existingConfig = integration.config as Record<string, unknown>;
        const mergedConfig = { ...existingConfig, ...helpdeskConfig };
        
        integration = await storage.updateIntegration(integration.id, {
          enabled: enabled ?? integration.enabled,
          config: mergedConfig,
        });
      } else {
        integration = await storage.createIntegration({
          knowledgeBaseId: kbId,
          type: 'helpdesk',
          enabled: enabled ?? false,
          config: helpdeskConfig,
        });
      }

      res.json(sanitizeHelpdeskConfig(integration));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Test helpdesk connection
  app.post("/api/integrations/helpdesk/test", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can test helpdesk" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      if (!integration) {
        return res.status(400).json({ success: false, message: "Helpdesk not configured" });
      }

      const config = integration.config as HelpdeskConfig;
      const { helpdeskService } = await import("./services/helpdesk");
      const result = await helpdeskService.testConnection(config);
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Disconnect helpdesk integration
  app.post("/api/integrations/helpdesk/disconnect", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can disconnect helpdesk" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      if (integration) {
        await storage.deleteIntegration(integration.id);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // List remote categories/sections from helpdesk
  app.get("/api/integrations/helpdesk/remote-categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view remote categories" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      if (!integration) {
        return res.status(400).json({ message: "Helpdesk not configured" });
      }

      const config = integration.config as HelpdeskConfig;
      const { helpdeskService } = await import("./services/helpdesk");

      if (config.provider === 'zendesk') {
        const categories = await helpdeskService.listZendeskCategories(config);
        const sections = await helpdeskService.listZendeskSections(config);
        res.json({ categories, sections });
      } else {
        const categories = await helpdeskService.listFreshdeskCategories(config);
        const folders: any[] = [];
        for (const cat of categories) {
          const catFolders = await helpdeskService.listFreshdeskFolders(config, cat.id);
          folders.push(...catFolders.map(f => ({ ...f, categoryName: cat.name })));
        }
        res.json({ categories, folders });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Trigger import from helpdesk
  app.post("/api/integrations/helpdesk/import", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can import articles" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      if (!integration) {
        return res.status(400).json({ message: "Helpdesk not configured" });
      }

      const config = integration.config as HelpdeskConfig;

      const job = await storage.createSyncJob({
        knowledgeBaseId: kbId,
        provider: config.provider || 'zendesk',
        direction: 'import',
        status: 'pending',
      });

      const { helpdeskService } = await import("./services/helpdesk");
      
      if (config.provider === 'freshdesk') {
        helpdeskService.importFromFreshdesk(kbId, config, job.id).catch(console.error);
      } else {
        helpdeskService.importFromZendesk(kbId, config, job.id).catch(console.error);
      }

      res.json({ success: true, jobId: job.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Trigger export to helpdesk
  app.post("/api/integrations/helpdesk/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can export articles" });
      }

      const integration = await storage.getIntegrationByType(kbId, 'helpdesk');
      if (!integration) {
        return res.status(400).json({ message: "Helpdesk not configured" });
      }

      const config = integration.config as HelpdeskConfig;
      const { articleIds } = req.body;

      const job = await storage.createSyncJob({
        knowledgeBaseId: kbId,
        provider: config.provider || 'zendesk',
        direction: 'export',
        status: 'pending',
      });

      const { helpdeskService } = await import("./services/helpdesk");
      
      if (config.provider === 'freshdesk') {
        helpdeskService.exportToFreshdesk(kbId, config, job.id, articleIds).catch(console.error);
      } else {
        helpdeskService.exportToZendesk(kbId, config, job.id, articleIds).catch(console.error);
      }

      res.json({ success: true, jobId: job.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get sync job history
  app.get("/api/integrations/helpdesk/sync-jobs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view sync history" });
      }

      const jobs = await storage.getSyncJobsByKnowledgeBaseId(kbId, 20);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single sync job status
  app.get("/api/integrations/helpdesk/sync-jobs/:jobId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view sync status" });
      }

      const job = await storage.getSyncJobById(req.params.jobId);
      if (!job || job.knowledgeBaseId !== kbId) {
        return res.status(404).json({ message: "Sync job not found" });
      }

      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get external article mappings
  app.get("/api/integrations/helpdesk/mappings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view mappings" });
      }

      const mappings = await storage.getExternalMappingsByKnowledgeBaseId(kbId);
      res.json(mappings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get conflicts
  app.get("/api/integrations/helpdesk/conflicts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can view conflicts" });
      }

      const conflicts = await storage.getConflictedMappings(kbId);
      res.json(conflicts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Resolve conflict
  app.post("/api/integrations/helpdesk/conflicts/:mappingId/resolve", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const kbId = req.query.kbId as string;

      if (!kbId) {
        return res.status(400).json({ message: "Knowledge base ID required" });
      }

      if (!await checkUserCanManage(userId, kbId)) {
        return res.status(403).json({ message: "Only owners and admins can resolve conflicts" });
      }

      const { resolution } = req.body;
      if (!['keep_local', 'keep_remote'].includes(resolution)) {
        return res.status(400).json({ message: "Invalid resolution. Use 'keep_local' or 'keep_remote'" });
      }

      await storage.updateExternalMapping(req.params.mappingId, {
        hasConflict: false,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}

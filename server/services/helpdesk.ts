import { storage } from "../storage";
import { HelpdeskConfig, Article, InsertArticle, Category } from "@shared/schema";
import crypto from "crypto";

interface ZendeskCategory {
  id: number;
  name: string;
  description: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

interface ZendeskSection {
  id: number;
  category_id: number;
  name: string;
  description: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

interface ZendeskArticle {
  id: number;
  title: string;
  body: string;
  locale: string;
  author_id: number;
  section_id: number;
  draft: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface FreshdeskCategory {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface FreshdeskFolder {
  id: number;
  category_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface FreshdeskArticle {
  id: number;
  title: string;
  description: string;
  folder_id: number;
  status: number;
  created_at: string;
  updated_at: string;
}

interface RateLimiter {
  queue: Array<() => Promise<void>>;
  processing: boolean;
  requestsPerMinute: number;
  lastRequestTime: number;
}

export class HelpdeskService {
  private rateLimiters: Map<string, RateLimiter> = new Map();

  private getRateLimiter(provider: string): RateLimiter {
    if (!this.rateLimiters.has(provider)) {
      this.rateLimiters.set(provider, {
        queue: [],
        processing: false,
        requestsPerMinute: provider === 'zendesk' ? 700 : 80,
        lastRequestTime: 0,
      });
    }
    return this.rateLimiters.get(provider)!;
  }

  private async rateLimitedRequest<T>(
    provider: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const limiter = this.getRateLimiter(provider);
    const minInterval = 60000 / limiter.requestsPerMinute;
    
    const now = Date.now();
    const timeSinceLastRequest = now - limiter.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }
    
    limiter.lastRequestTime = Date.now();
    return requestFn();
  }

  private getZendeskAuth(config: HelpdeskConfig): string {
    const credentials = `${config.email}/token:${config.apiToken}`;
    return Buffer.from(credentials).toString('base64');
  }

  private getFreshdeskAuth(config: HelpdeskConfig): string {
    return Buffer.from(`${config.apiKey}:X`).toString('base64');
  }

  private getBaseUrl(config: HelpdeskConfig): string {
    if (config.provider === 'zendesk') {
      return `https://${config.subdomain}.zendesk.com`;
    }
    return `https://${config.subdomain}.freshdesk.com`;
  }

  async testConnection(config: HelpdeskConfig): Promise<{ success: boolean; message: string }> {
    try {
      if (config.provider === 'zendesk') {
        const url = `${this.getBaseUrl(config)}/api/v2/help_center/categories.json`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Basic ${this.getZendeskAuth(config)}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return { success: false, message: 'Invalid credentials. Check your email and API token.' };
          }
          return { success: false, message: `Connection failed: ${response.statusText}` };
        }
        
        return { success: true, message: 'Successfully connected to Zendesk Help Center' };
      } else {
        const url = `${this.getBaseUrl(config)}/api/v2/solutions/categories`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return { success: false, message: 'Invalid API key.' };
          }
          return { success: false, message: `Connection failed: ${response.statusText}` };
        }
        
        return { success: true, message: 'Successfully connected to Freshdesk' };
      }
    } catch (error: any) {
      return { success: false, message: `Connection error: ${error.message}` };
    }
  }

  async listZendeskCategories(config: HelpdeskConfig): Promise<ZendeskCategory[]> {
    return this.rateLimitedRequest('zendesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/help_center/categories.json`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.getZendeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.categories || [];
    });
  }

  async listZendeskSections(config: HelpdeskConfig, categoryId?: number): Promise<ZendeskSection[]> {
    return this.rateLimitedRequest('zendesk', async () => {
      const url = categoryId
        ? `${this.getBaseUrl(config)}/api/v2/help_center/categories/${categoryId}/sections.json`
        : `${this.getBaseUrl(config)}/api/v2/help_center/sections.json`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.getZendeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sections: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.sections || [];
    });
  }

  async listZendeskArticles(config: HelpdeskConfig, sectionId?: number): Promise<ZendeskArticle[]> {
    const allArticles: ZendeskArticle[] = [];
    let nextPage: string | null = sectionId
      ? `${this.getBaseUrl(config)}/api/v2/help_center/sections/${sectionId}/articles.json`
      : `${this.getBaseUrl(config)}/api/v2/help_center/articles.json`;
    
    while (nextPage) {
      const data = await this.rateLimitedRequest('zendesk', async () => {
        const response = await fetch(nextPage!, {
          headers: {
            'Authorization': `Basic ${this.getZendeskAuth(config)}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch articles: ${response.statusText}`);
        }
        
        return response.json();
      });
      
      allArticles.push(...(data.articles || []));
      nextPage = data.next_page || null;
    }
    
    return allArticles;
  }

  async createZendeskArticle(
    config: HelpdeskConfig,
    sectionId: number,
    title: string,
    body: string
  ): Promise<ZendeskArticle> {
    return this.rateLimitedRequest('zendesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/help_center/sections/${sectionId}/articles.json`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.getZendeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article: {
            title,
            body,
            locale: 'en-us',
            draft: false,
          },
          notify_subscribers: false,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create article: ${error}`);
      }
      
      const data = await response.json();
      return data.article;
    });
  }

  async updateZendeskArticle(
    config: HelpdeskConfig,
    articleId: number,
    title: string,
    body: string
  ): Promise<ZendeskArticle> {
    return this.rateLimitedRequest('zendesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/help_center/articles/${articleId}.json`;
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${this.getZendeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article: {
            title,
            body,
          },
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update article: ${error}`);
      }
      
      const data = await response.json();
      return data.article;
    });
  }

  async listFreshdeskCategories(config: HelpdeskConfig): Promise<FreshdeskCategory[]> {
    return this.rateLimitedRequest('freshdesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/solutions/categories`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.statusText}`);
      }
      
      return response.json();
    });
  }

  async listFreshdeskFolders(config: HelpdeskConfig, categoryId: number): Promise<FreshdeskFolder[]> {
    return this.rateLimitedRequest('freshdesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/solutions/categories/${categoryId}/folders`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch folders: ${response.statusText}`);
      }
      
      return response.json();
    });
  }

  async listFreshdeskArticles(config: HelpdeskConfig, folderId: number): Promise<FreshdeskArticle[]> {
    return this.rateLimitedRequest('freshdesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/solutions/folders/${folderId}/articles`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch articles: ${response.statusText}`);
      }
      
      return response.json();
    });
  }

  async createFreshdeskArticle(
    config: HelpdeskConfig,
    folderId: number,
    title: string,
    description: string
  ): Promise<FreshdeskArticle> {
    return this.rateLimitedRequest('freshdesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/solutions/folders/${folderId}/articles`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          status: 2,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create article: ${error}`);
      }
      
      return response.json();
    });
  }

  async updateFreshdeskArticle(
    config: HelpdeskConfig,
    articleId: number,
    title: string,
    description: string
  ): Promise<FreshdeskArticle> {
    return this.rateLimitedRequest('freshdesk', async () => {
      const url = `${this.getBaseUrl(config)}/api/v2/solutions/articles/${articleId}`;
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${this.getFreshdeskAuth(config)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update article: ${error}`);
      }
      
      return response.json();
    });
  }

  generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async importFromZendesk(
    kbId: string,
    config: HelpdeskConfig,
    jobId: string
  ): Promise<void> {
    try {
      await storage.updateSyncJob(jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const sections = await this.listZendeskSections(config);
      const localCategories = await storage.getCategoriesByKnowledgeBaseId(kbId);
      
      let totalItems = 0;
      let processedItems = 0;
      let createdItems = 0;
      let updatedItems = 0;
      let skippedItems = 0;
      const errorLog: Array<{ articleId?: string; error: string; timestamp: string }> = [];

      for (const section of sections) {
        const articles = await this.listZendeskArticles(config, section.id);
        totalItems += articles.length;
        
        await storage.updateSyncJob(jobId, { totalItems });

        for (const zendeskArticle of articles) {
          try {
            const existingMapping = await storage.getExternalMappingByExternalId(
              kbId,
              zendeskArticle.id.toString(),
              'zendesk'
            );

            const contentHash = this.generateContentHash(zendeskArticle.body || '');
            
            let localCategory = localCategories.find(c => 
              config.categoryMappings?.find(m => 
                m.externalSectionId === section.id.toString() && m.localCategoryId === c.id
              )
            );

            if (!localCategory && section.name) {
              localCategory = await storage.createCategory({
                knowledgeBaseId: kbId,
                name: section.name,
                description: section.description || '',
                order: localCategories.length,
              });
              localCategories.push(localCategory);
            }

            if (existingMapping) {
              if (existingMapping.contentHash === contentHash) {
                skippedItems++;
                processedItems++;
                continue;
              }

              await storage.updateArticle(existingMapping.localArticleId!, {
                title: zendeskArticle.title,
                content: zendeskArticle.body || '',
                categoryId: localCategory?.id,
              });

              await storage.updateExternalMapping(existingMapping.id, {
                contentHash,
                externalUpdatedAt: new Date(zendeskArticle.updated_at),
                localUpdatedAt: new Date(),
              });

              updatedItems++;
            } else {
              const newArticle = await storage.createArticle({
                knowledgeBaseId: kbId,
                title: zendeskArticle.title,
                content: zendeskArticle.body || '',
                categoryId: localCategory?.id,
                isPublic: !zendeskArticle.draft,
              });

              await storage.createExternalMapping({
                knowledgeBaseId: kbId,
                localArticleId: newArticle.id,
                provider: 'zendesk',
                externalId: zendeskArticle.id.toString(),
                externalUrl: zendeskArticle.html_url,
                syncDirection: 'imported',
                contentHash,
                externalUpdatedAt: new Date(zendeskArticle.updated_at),
                localUpdatedAt: new Date(),
              });

              createdItems++;
            }

            processedItems++;
            await storage.updateSyncJob(jobId, {
              processedItems,
              createdItems,
              updatedItems,
              skippedItems,
            });
          } catch (error: any) {
            errorLog.push({
              articleId: zendeskArticle.id.toString(),
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      await storage.updateSyncJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems,
        createdItems,
        updatedItems,
        skippedItems,
        failedItems: errorLog.length,
        errorLog,
      });
    } catch (error: any) {
      await storage.updateSyncJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorLog: [{ error: error.message, timestamp: new Date().toISOString() }],
      });
      throw error;
    }
  }

  async exportToZendesk(
    kbId: string,
    config: HelpdeskConfig,
    jobId: string,
    articleIds?: string[]
  ): Promise<void> {
    try {
      await storage.updateSyncJob(jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const allArticles = await storage.getArticlesByKnowledgeBaseId(kbId);
      const articles = articleIds
        ? allArticles.filter(a => articleIds.includes(a.id))
        : allArticles.filter(a => a.isPublic);

      const defaultSectionId = config.defaultSectionId
        ? parseInt(config.defaultSectionId)
        : null;

      if (!defaultSectionId) {
        throw new Error('No default section configured for export');
      }

      let processedItems = 0;
      let createdItems = 0;
      let updatedItems = 0;
      let skippedItems = 0;
      const errorLog: Array<{ articleId?: string; error: string; timestamp: string }> = [];

      await storage.updateSyncJob(jobId, { totalItems: articles.length });

      for (const article of articles) {
        try {
          const existingMapping = await storage.getExternalMappingByLocalArticle(
            kbId,
            article.id,
            'zendesk'
          );

          const contentHash = this.generateContentHash(article.content);
          
          let targetSectionId = defaultSectionId;
          if (article.categoryId) {
            const mapping = config.categoryMappings?.find(
              m => m.localCategoryId === article.categoryId
            );
            if (mapping) {
              targetSectionId = parseInt(mapping.externalSectionId);
            }
          }

          if (existingMapping) {
            if (existingMapping.contentHash === contentHash) {
              skippedItems++;
              processedItems++;
              continue;
            }

            const updated = await this.updateZendeskArticle(
              config,
              parseInt(existingMapping.externalId),
              article.title,
              article.content
            );

            await storage.updateExternalMapping(existingMapping.id, {
              contentHash,
              localUpdatedAt: article.updatedAt,
              externalUpdatedAt: new Date(updated.updated_at),
            });

            updatedItems++;
          } else {
            const created = await this.createZendeskArticle(
              config,
              targetSectionId,
              article.title,
              article.content
            );

            await storage.createExternalMapping({
              knowledgeBaseId: kbId,
              localArticleId: article.id,
              provider: 'zendesk',
              externalId: created.id.toString(),
              externalUrl: created.html_url,
              syncDirection: 'exported',
              contentHash,
              localUpdatedAt: article.updatedAt,
              externalUpdatedAt: new Date(created.updated_at),
            });

            createdItems++;
          }

          processedItems++;
          await storage.updateSyncJob(jobId, {
            processedItems,
            createdItems,
            updatedItems,
            skippedItems,
          });
        } catch (error: any) {
          errorLog.push({
            articleId: article.id,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      await storage.updateSyncJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems,
        createdItems,
        updatedItems,
        skippedItems,
        failedItems: errorLog.length,
        errorLog,
      });
    } catch (error: any) {
      await storage.updateSyncJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorLog: [{ error: error.message, timestamp: new Date().toISOString() }],
      });
      throw error;
    }
  }

  async importFromFreshdesk(
    kbId: string,
    config: HelpdeskConfig,
    jobId: string
  ): Promise<void> {
    try {
      await storage.updateSyncJob(jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const categories = await this.listFreshdeskCategories(config);
      const localCategories = await storage.getCategoriesByKnowledgeBaseId(kbId);
      
      let totalItems = 0;
      let processedItems = 0;
      let createdItems = 0;
      let updatedItems = 0;
      let skippedItems = 0;
      const errorLog: Array<{ articleId?: string; error: string; timestamp: string }> = [];

      for (const category of categories) {
        const folders = await this.listFreshdeskFolders(config, category.id);
        
        for (const folder of folders) {
          const articles = await this.listFreshdeskArticles(config, folder.id);
          totalItems += articles.length;
          
          await storage.updateSyncJob(jobId, { totalItems });

          for (const freshdeskArticle of articles) {
            try {
              const existingMapping = await storage.getExternalMappingByExternalId(
                kbId,
                freshdeskArticle.id.toString(),
                'freshdesk'
              );

              const contentHash = this.generateContentHash(freshdeskArticle.description || '');
              
              let localCategory = localCategories.find(c => 
                config.categoryMappings?.find(m => 
                  m.externalSectionId === folder.id.toString() && m.localCategoryId === c.id
                )
              );

              if (!localCategory && folder.name) {
                localCategory = await storage.createCategory({
                  knowledgeBaseId: kbId,
                  name: folder.name,
                  description: folder.description || '',
                  order: localCategories.length,
                });
                localCategories.push(localCategory);
              }

              if (existingMapping) {
                if (existingMapping.contentHash === contentHash) {
                  skippedItems++;
                  processedItems++;
                  continue;
                }

                await storage.updateArticle(existingMapping.localArticleId!, {
                  title: freshdeskArticle.title,
                  content: freshdeskArticle.description || '',
                  categoryId: localCategory?.id,
                });

                await storage.updateExternalMapping(existingMapping.id, {
                  contentHash,
                  externalUpdatedAt: new Date(freshdeskArticle.updated_at),
                  localUpdatedAt: new Date(),
                });

                updatedItems++;
              } else {
                const newArticle = await storage.createArticle({
                  knowledgeBaseId: kbId,
                  title: freshdeskArticle.title,
                  content: freshdeskArticle.description || '',
                  categoryId: localCategory?.id,
                  isPublic: freshdeskArticle.status === 2,
                });

                await storage.createExternalMapping({
                  knowledgeBaseId: kbId,
                  localArticleId: newArticle.id,
                  provider: 'freshdesk',
                  externalId: freshdeskArticle.id.toString(),
                  syncDirection: 'imported',
                  contentHash,
                  externalUpdatedAt: new Date(freshdeskArticle.updated_at),
                  localUpdatedAt: new Date(),
                });

                createdItems++;
              }

              processedItems++;
              await storage.updateSyncJob(jobId, {
                processedItems,
                createdItems,
                updatedItems,
                skippedItems,
              });
            } catch (error: any) {
              errorLog.push({
                articleId: freshdeskArticle.id.toString(),
                error: error.message,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      }

      await storage.updateSyncJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems,
        createdItems,
        updatedItems,
        skippedItems,
        failedItems: errorLog.length,
        errorLog,
      });
    } catch (error: any) {
      await storage.updateSyncJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorLog: [{ error: error.message, timestamp: new Date().toISOString() }],
      });
      throw error;
    }
  }

  async exportToFreshdesk(
    kbId: string,
    config: HelpdeskConfig,
    jobId: string,
    articleIds?: string[]
  ): Promise<void> {
    try {
      await storage.updateSyncJob(jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const allArticles = await storage.getArticlesByKnowledgeBaseId(kbId);
      const articles = articleIds
        ? allArticles.filter(a => articleIds.includes(a.id))
        : allArticles.filter(a => a.isPublic);

      const defaultFolderId = config.defaultFolderId
        ? parseInt(config.defaultFolderId)
        : null;

      if (!defaultFolderId) {
        throw new Error('No default folder configured for export');
      }

      let processedItems = 0;
      let createdItems = 0;
      let updatedItems = 0;
      let skippedItems = 0;
      const errorLog: Array<{ articleId?: string; error: string; timestamp: string }> = [];

      await storage.updateSyncJob(jobId, { totalItems: articles.length });

      for (const article of articles) {
        try {
          const existingMapping = await storage.getExternalMappingByLocalArticle(
            kbId,
            article.id,
            'freshdesk'
          );

          const contentHash = this.generateContentHash(article.content);
          
          let targetFolderId = defaultFolderId;
          if (article.categoryId) {
            const mapping = config.categoryMappings?.find(
              m => m.localCategoryId === article.categoryId
            );
            if (mapping) {
              targetFolderId = parseInt(mapping.externalSectionId);
            }
          }

          if (existingMapping) {
            if (existingMapping.contentHash === contentHash) {
              skippedItems++;
              processedItems++;
              continue;
            }

            const updated = await this.updateFreshdeskArticle(
              config,
              parseInt(existingMapping.externalId),
              article.title,
              article.content
            );

            await storage.updateExternalMapping(existingMapping.id, {
              contentHash,
              localUpdatedAt: article.updatedAt,
              externalUpdatedAt: new Date(updated.updated_at),
            });

            updatedItems++;
          } else {
            const created = await this.createFreshdeskArticle(
              config,
              targetFolderId,
              article.title,
              article.content
            );

            await storage.createExternalMapping({
              knowledgeBaseId: kbId,
              localArticleId: article.id,
              provider: 'freshdesk',
              externalId: created.id.toString(),
              syncDirection: 'exported',
              contentHash,
              localUpdatedAt: article.updatedAt,
              externalUpdatedAt: new Date(created.updated_at),
            });

            createdItems++;
          }

          processedItems++;
          await storage.updateSyncJob(jobId, {
            processedItems,
            createdItems,
            updatedItems,
            skippedItems,
          });
        } catch (error: any) {
          errorLog.push({
            articleId: article.id,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      await storage.updateSyncJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems,
        createdItems,
        updatedItems,
        skippedItems,
        failedItems: errorLog.length,
        errorLog,
      });
    } catch (error: any) {
      await storage.updateSyncJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorLog: [{ error: error.message, timestamp: new Date().toISOString() }],
      });
      throw error;
    }
  }
}

export const helpdeskService = new HelpdeskService();

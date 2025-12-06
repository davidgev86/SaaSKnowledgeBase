import type { Article } from "@shared/schema";

export interface ServiceNowConfig {
  instanceUrl: string;
  knowledgeBaseId?: string;
  incidentFormEnabled?: boolean;
  autoSync?: boolean;
}

export interface ServiceNowCredentials {
  username: string;
  password: string;
}

export interface ServiceNowArticle {
  short_description: string;
  text: string;
  kb_knowledge_base: string;
  workflow_state: string;
}

export interface ServiceNowIncident {
  short_description: string;
  description: string;
  category?: string;
  subcategory?: string;
  caller_id?: string;
}

export class ServiceNowService {
  private instanceUrl: string;
  private auth: string;

  constructor(instanceUrl: string, credentials: ServiceNowCredentials) {
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
    this.auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  }

  private async makeRequest(endpoint: string, method: string, body?: any): Promise<any> {
    const url = `${this.instanceUrl}/api/now/${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ServiceNow API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.makeRequest('table/sys_user?sysparm_limit=1', 'GET');
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getKnowledgeBases(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.makeRequest('table/kb_knowledge_base?sysparm_fields=sys_id,title&sysparm_limit=100', 'GET');
      return response.result.map((kb: any) => ({
        id: kb.sys_id,
        name: kb.title,
      }));
    } catch (error) {
      console.error('Failed to fetch ServiceNow knowledge bases:', error);
      return [];
    }
  }

  async syncArticle(article: Article, serviceNowKbId: string): Promise<{ success: boolean; sysId?: string; error?: string }> {
    try {
      const htmlContent = article.content.replace(/<[^>]+>/g, ' ').trim();
      
      const snowArticle: ServiceNowArticle = {
        short_description: article.title,
        text: article.content,
        kb_knowledge_base: serviceNowKbId,
        workflow_state: article.isPublic ? 'published' : 'draft',
      };

      const response = await this.makeRequest('table/kb_knowledge', 'POST', snowArticle);
      
      return {
        success: true,
        sysId: response.result.sys_id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async syncArticles(articles: Article[], serviceNowKbId: string): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const results = { synced: 0, failed: 0, errors: [] as string[] };

    for (const article of articles) {
      const result = await this.syncArticle(article, serviceNowKbId);
      if (result.success) {
        results.synced++;
      } else {
        results.failed++;
        results.errors.push(`${article.title}: ${result.error}`);
      }
    }

    return results;
  }

  async createIncident(incident: ServiceNowIncident): Promise<{ success: boolean; number?: string; sysId?: string; error?: string }> {
    try {
      const response = await this.makeRequest('table/incident', 'POST', incident);
      
      return {
        success: true,
        number: response.result.number,
        sysId: response.result.sys_id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  generateIncidentFormUrl(articleTitle: string, articleUrl: string): string {
    const params = new URLSearchParams({
      sysparm_query: `short_description=Help needed: ${articleTitle}`,
      sysparm_description: `User needs additional help with: ${articleTitle}\n\nReference article: ${articleUrl}`,
    });
    
    return `${this.instanceUrl}/incident.do?${params.toString()}`;
  }
}

export function getServiceNowCredentials(): ServiceNowCredentials | null {
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

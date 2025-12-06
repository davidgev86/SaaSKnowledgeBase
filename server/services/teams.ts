import type { Article, KnowledgeBase, TeamsConfig } from "@shared/schema";
import crypto from "crypto";

export interface TeamsCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export interface TeamsOAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
}

export interface TeamsTeam {
  id: string;
  displayName: string;
  description?: string;
}

export interface AdaptiveCard {
  type: "AdaptiveCard";
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
  $schema?: string;
}

export interface AdaptiveCardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  wrap?: boolean;
  spacing?: string;
  separator?: boolean;
  items?: AdaptiveCardElement[];
  columns?: AdaptiveCardColumn[];
}

export interface AdaptiveCardColumn {
  type: "Column";
  width: string | number;
  items: AdaptiveCardElement[];
}

export interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
  data?: any;
}

export interface TeamsBotActivity {
  type: string;
  id?: string;
  timestamp?: string;
  serviceUrl: string;
  channelId: string;
  from: { id: string; name?: string };
  conversation: { id: string; tenantId?: string };
  recipient: { id: string; name?: string };
  text?: string;
  value?: any;
  channelData?: any;
}

export class TeamsService {
  private credentials: TeamsCredentials;
  private config: TeamsConfig;

  constructor(credentials: TeamsCredentials, config: TeamsConfig) {
    this.credentials = credentials;
    this.config = config;
  }

  getOAuthUrl(kbId: string, redirectUri: string): string {
    const state = this.generateState(kbId);
    const scopes = [
      "https://graph.microsoft.com/Team.ReadBasic.All",
      "https://graph.microsoft.com/Channel.ReadBasic.All",
      "https://graph.microsoft.com/ChannelMessage.Send",
      "offline_access",
    ].join(" ");

    const tenantId = this.credentials.tenantId || "common";
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scopes,
      state: state,
      response_mode: "query",
    });

    return `${authUrl}?${params.toString()}`;
  }

  private generateState(kbId: string): string {
    const stateData = {
      kbId,
      nonce: crypto.randomBytes(16).toString("hex"),
      timestamp: Date.now(),
    };
    const payload = Buffer.from(JSON.stringify(stateData)).toString("base64url");
    const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  parseState(state: string): { kbId: string; nonce: string; timestamp: number } | null {
    try {
      const parts = state.split(".");
      if (parts.length !== 2) {
        return null;
      }

      const [payload, signature] = parts;
      const secret = process.env.SESSION_SECRET || "";
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error("Teams state signature verification failed");
        return null;
      }

      const decoded = Buffer.from(payload, "base64url").toString("utf8");
      const stateData = JSON.parse(decoded);

      const STATE_EXPIRY_MS = 10 * 60 * 1000;
      if (Date.now() - stateData.timestamp > STATE_EXPIRY_MS) {
        console.error("Teams state expired");
        return null;
      }

      return stateData;
    } catch (error) {
      console.error("Teams state parsing error:", error);
      return null;
    }
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<TeamsOAuthResponse | null> {
    try {
      const tenantId = this.credentials.tenantId || "common";
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: "https://graph.microsoft.com/.default offline_access",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Teams token exchange error:", error);
        return null;
      }

      return response.json();
    } catch (error) {
      console.error("Teams token exchange failed:", error);
      return null;
    }
  }

  async refreshAccessToken(): Promise<TeamsOAuthResponse | null> {
    if (!this.config.refreshToken) {
      return null;
    }

    try {
      const tenantId = this.credentials.tenantId || "common";
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/.default offline_access",
        }),
      });

      if (!response.ok) {
        console.error("Teams token refresh error:", await response.text());
        return null;
      }

      return response.json();
    } catch (error) {
      console.error("Teams token refresh failed:", error);
      return null;
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (this.config.accessToken) {
      if (this.config.tokenExpiresAt && Date.now() < this.config.tokenExpiresAt - 60000) {
        return this.config.accessToken;
      }
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return refreshed.access_token;
      }
    }
    return null;
  }

  async getJoinedTeams(): Promise<TeamsTeam[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];

    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error("Failed to get joined teams:", error);
      return [];
    }
  }

  async getTeamChannels(teamId: string): Promise<TeamsChannel[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];

    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${teamId}/channels`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) return [];

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error("Failed to get team channels:", error);
      return [];
    }
  }

  async sendChannelMessage(
    teamId: string,
    channelId: string,
    card: AdaptiveCard
  ): Promise<{ success: boolean; error?: string }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return { success: false, error: "No access token" };
    }

    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: {
              contentType: "html",
              content: `<attachment id="card"></attachment>`,
            },
            attachments: [
              {
                id: "card",
                contentType: "application/vnd.microsoft.card.adaptive",
                content: JSON.stringify(card),
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async postToWebhook(
    webhookUrl: string,
    card: AdaptiveCard
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: card,
            },
          ],
        }),
      });

      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async sendPublishNotification(
    articleTitle: string,
    articleUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const card: AdaptiveCard = {
      type: "AdaptiveCard",
      version: "1.4",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      body: [
        {
          type: "TextBlock",
          text: "New Article Published",
          wrap: true,
          weight: "Bolder",
          size: "Large",
        },
        {
          type: "TextBlock",
          text: articleTitle,
          wrap: true,
          weight: "Bolder",
          size: "Medium",
        },
      ],
      actions: articleUrl
        ? [
            {
              type: "Action.OpenUrl",
              title: "View Article",
              url: articleUrl,
            },
          ]
        : undefined,
    };

    if (this.config.webhookUrl) {
      return this.postToWebhook(this.config.webhookUrl, card);
    }

    if (this.config.teamId && this.config.channelId) {
      return this.sendChannelMessage(this.config.teamId, this.config.channelId, card);
    }

    return { success: false, error: "No channel or webhook configured" };
  }

  verifyBotRequest(
    authHeader: string | undefined,
    activity: TeamsBotActivity
  ): boolean {
    if (!authHeader) {
      return false;
    }

    return true;
  }

  formatSearchResults(
    articles: Article[],
    query: string,
    kbSlug: string,
    baseUrl: string
  ): AdaptiveCard {
    const body: AdaptiveCardElement[] = [];

    if (articles.length === 0) {
      body.push({
        type: "TextBlock",
        text: `No articles found for "${query}"`,
        wrap: true,
        weight: "Bolder",
      });
    } else {
      body.push({
        type: "TextBlock",
        text: `Found ${articles.length} article${articles.length > 1 ? "s" : ""} for "${query}"`,
        wrap: true,
        weight: "Bolder",
        size: "Medium",
      });

      articles.slice(0, 5).forEach((article) => {
        const articleUrl = `${baseUrl}/kb/${kbSlug}/articles/${article.id}`;
        const snippet = this.stripHtml(article.content).slice(0, 150);

        body.push({
          type: "Container",
          separator: true,
          items: [
            {
              type: "TextBlock",
              text: article.title,
              wrap: true,
              weight: "Bolder",
            },
            {
              type: "TextBlock",
              text: snippet + (snippet.length >= 150 ? "..." : ""),
              wrap: true,
              size: "Small",
            },
          ],
        } as AdaptiveCardElement);
      });
    }

    const actions: AdaptiveCardAction[] = articles.slice(0, 3).map((article) => ({
      type: "Action.OpenUrl",
      title: article.title.length > 20 ? article.title.slice(0, 17) + "..." : article.title,
      url: `${baseUrl}/kb/${kbSlug}/articles/${article.id}`,
    }));

    return {
      type: "AdaptiveCard",
      version: "1.4",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      body,
      actions: actions.length > 0 ? actions : undefined,
    };
  }

  formatArticlePublishedCard(
    article: Article,
    kb: KnowledgeBase,
    baseUrl: string
  ): AdaptiveCard {
    const articleUrl = `${baseUrl}/kb/${kb.slug}/articles/${article.id}`;
    const snippet = this.stripHtml(article.content).slice(0, 200);

    return {
      type: "AdaptiveCard",
      version: "1.4",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      body: [
        {
          type: "TextBlock",
          text: "New Article Published",
          wrap: true,
          weight: "Bolder",
          size: "Large",
        },
        {
          type: "TextBlock",
          text: article.title,
          wrap: true,
          weight: "Bolder",
          size: "Medium",
        },
        {
          type: "TextBlock",
          text: snippet + (snippet.length >= 200 ? "..." : ""),
          wrap: true,
        },
        {
          type: "TextBlock",
          text: `Published in ${kb.siteTitle}`,
          wrap: true,
          size: "Small",
          weight: "Lighter",
        },
      ],
      actions: [
        {
          type: "Action.OpenUrl",
          title: "View Article",
          url: articleUrl,
        },
      ],
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  parseCommand(text: string): { action: string; query: string } {
    const parts = text.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase() || "search";
    const query = parts.slice(1).join(" ");
    return { action, query };
  }

  formatHelpCard(): AdaptiveCard {
    return {
      type: "AdaptiveCard",
      version: "1.4",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      body: [
        {
          type: "TextBlock",
          text: "Knowledge Base Commands",
          wrap: true,
          weight: "Bolder",
          size: "Large",
        },
        {
          type: "TextBlock",
          text: "Use the following commands:",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "**search [query]** - Search for articles",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "**help** - Show this help message",
          wrap: true,
        },
      ],
    };
  }
}

export function getTeamsCredentials(): TeamsCredentials | null {
  const clientId = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  const tenantId = process.env.TEAMS_TENANT_ID;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, tenantId: tenantId || "common" };
}

export function createTeamsService(
  config: TeamsConfig,
  credentials?: TeamsCredentials | null
): TeamsService | null {
  const creds = credentials || getTeamsCredentials();
  if (!creds) {
    return null;
  }
  return new TeamsService(creds, config);
}

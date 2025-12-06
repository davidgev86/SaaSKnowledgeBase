import type { Article, KnowledgeBase, SlackConfig } from "@shared/schema";
import crypto from "crypto";

export interface SlackCredentials {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

export interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  team?: {
    id: string;
    name: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    url: string;
  };
  error?: string;
}

export interface SlackSlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  accessory?: any;
  elements?: any[];
}

export interface SlackMessage {
  response_type?: "in_channel" | "ephemeral";
  text: string;
  blocks?: SlackBlock[];
}

export class SlackService {
  private credentials: SlackCredentials;
  private accessToken?: string;

  constructor(credentials: SlackCredentials, accessToken?: string) {
    this.credentials = credentials;
    this.accessToken = accessToken;
  }

  verifySlackRequest(
    signature: string | undefined,
    timestamp: string | undefined,
    body: string
  ): boolean {
    if (!signature || !timestamp || !this.credentials.signingSecret) {
      return false;
    }

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp) < fiveMinutesAgo) {
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature =
      "v0=" +
      crypto
        .createHmac("sha256", this.credentials.signingSecret)
        .update(sigBasestring, "utf8")
        .digest("hex");

    try {
      const signatureBuffer = Buffer.from(signature, "utf8");
      const mySignatureBuffer = Buffer.from(mySignature, "utf8");
      
      if (signatureBuffer.length !== mySignatureBuffer.length) {
        return false;
      }
      
      return crypto.timingSafeEqual(mySignatureBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  getOAuthUrl(kbId: string, redirectUri: string): string {
    const state = Buffer.from(JSON.stringify({ kbId })).toString("base64");
    const scopes = [
      "commands",
      "chat:write",
      "incoming-webhook",
    ].join(",");

    return `https://slack.com/oauth/v2/authorize?client_id=${this.credentials.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<SlackOAuthResponse> {
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    return response.json();
  }

  async postMessage(
    channel: string,
    message: SlackMessage
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.accessToken) {
      return { ok: false, error: "No access token configured" };
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        ...message,
      }),
    });

    return response.json();
  }

  formatSearchResults(
    articles: Article[],
    query: string,
    kbSlug: string,
    baseUrl: string
  ): SlackMessage {
    if (articles.length === 0) {
      return {
        response_type: "ephemeral",
        text: `No articles found for "${query}"`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:mag: No articles found for *"${query}"*`,
            },
          },
        ],
      };
    }

    const blocks: SlackBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:mag: Found ${articles.length} article${articles.length > 1 ? "s" : ""} for *"${query}"*`,
        },
      },
      { type: "divider" } as any,
    ];

    articles.slice(0, 5).forEach((article) => {
      const articleUrl = `${baseUrl}/kb/${kbSlug}/articles/${article.id}`;
      const snippet = this.stripHtml(article.content).slice(0, 150);

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${articleUrl}|${article.title}>*\n${snippet}${snippet.length >= 150 ? "..." : ""}`,
        },
      });
    });

    if (articles.length > 5) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_Showing 5 of ${articles.length} results_`,
          },
        ],
      } as any);
    }

    return {
      response_type: "ephemeral",
      text: `Found ${articles.length} articles for "${query}"`,
      blocks,
    };
  }

  formatArticlePublishedMessage(
    article: Article,
    kb: KnowledgeBase,
    baseUrl: string
  ): SlackMessage {
    const articleUrl = `${baseUrl}/kb/${kb.slug}/articles/${article.id}`;
    const snippet = this.stripHtml(article.content).slice(0, 200);

    return {
      text: `New article published: ${article.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:newspaper: *New Article Published*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*<${articleUrl}|${article.title}>*\n${snippet}${snippet.length >= 200 ? "..." : ""}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Published in *${kb.siteTitle}*`,
            },
          ],
        } as any,
      ],
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  parseSlashCommand(text: string): { action: string; query: string } {
    const parts = text.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase() || "search";
    const query = parts.slice(1).join(" ");
    return { action, query };
  }

  formatHelpMessage(): SlackMessage {
    return {
      response_type: "ephemeral",
      text: "Knowledge Base Slash Command Help",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Knowledge Base Commands*",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "`/kb search <query>` - Search for articles\n" +
              "`/kb help` - Show this help message",
          },
        },
      ],
    };
  }
}

export function getSlackCredentials(): SlackCredentials | null {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!clientId || !clientSecret || !signingSecret) {
    return null;
  }

  return { clientId, clientSecret, signingSecret };
}

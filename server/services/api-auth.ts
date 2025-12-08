import { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { storage } from "../storage";
import type { ApiKey } from "@shared/schema";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitWindow>();

const DEFAULT_RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function generateApiKey(): { prefix: string; secret: string; fullKey: string } {
  const prefix = `kb_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  const fullKey = `${prefix}_${secret}`;
  return { prefix, secret, fullKey };
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyApiKey(secret: string, hashedKey: string): boolean {
  const hash = hashApiKey(secret);
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(hashedKey));
  } catch {
    return false;
  }
}

function checkRateLimit(keyId: string, limit: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let window = rateLimitStore.get(keyId);
  
  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(keyId, window);
  }
  
  if (window.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }
  
  window.count++;
  return { allowed: true, remaining: limit - window.count, resetAt: window.resetAt };
}

export interface AuthenticatedApiRequest extends Request {
  apiKey?: ApiKey;
  kbId?: string;
}

export function apiKeyAuth(requiredScopes: string[] = []) {
  return async (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Missing or invalid authorization header. Use 'Bearer <api_key>' format.",
      });
    }
    
    const fullKey = authHeader.slice(7);
    const keyParts = fullKey.split("_");
    
    if (keyParts.length !== 3 || keyParts[0] !== "kb") {
      return res.status(401).json({
        error: "unauthorized",
        message: "Invalid API key format.",
      });
    }
    
    const prefix = `${keyParts[0]}_${keyParts[1]}`;
    const secret = keyParts[2];
    
    try {
      const apiKey = await storage.getApiKeyByPrefix(prefix);
      
      if (!apiKey) {
        return res.status(401).json({
          error: "unauthorized",
          message: "Invalid API key.",
        });
      }
      
      if (!verifyApiKey(secret, apiKey.hashedKey)) {
        return res.status(401).json({
          error: "unauthorized",
          message: "Invalid API key.",
        });
      }
      
      if (apiKey.revokedAt) {
        return res.status(401).json({
          error: "unauthorized",
          message: "API key has been revoked.",
        });
      }
      
      for (const scope of requiredScopes) {
        if (!apiKey.scopes.includes(scope) && !apiKey.scopes.includes("write")) {
          return res.status(403).json({
            error: "forbidden",
            message: `Missing required scope: ${scope}`,
          });
        }
      }
      
      const rateLimit = apiKey.rateLimitOverride || DEFAULT_RATE_LIMIT;
      const { allowed, remaining, resetAt } = checkRateLimit(apiKey.id, rateLimit);
      
      res.setHeader("X-RateLimit-Limit", rateLimit);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));
      
      if (!allowed) {
        return res.status(429).json({
          error: "rate_limited",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
        });
      }
      
      await storage.incrementApiKeyUsage(apiKey.id);
      
      req.apiKey = apiKey;
      req.kbId = apiKey.knowledgeBaseId;
      
      next();
    } catch (error) {
      console.error("API key auth error:", error);
      return res.status(500).json({
        error: "internal_error",
        message: "An internal error occurred while authenticating.",
      });
    }
  };
}

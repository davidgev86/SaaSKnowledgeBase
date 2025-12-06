import crypto from "crypto";
import { SSOConfig } from "@shared/schema";

const STATE_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const STATE_EXPIRY_MS = 10 * 60 * 1000;

interface SSOCredentials {
  callbackUrl: string;
}

interface OIDCTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface OIDCUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

interface SAMLAssertion {
  nameId: string;
  sessionIndex?: string;
  attributes: Record<string, string | string[]>;
}

export class SSOService {
  private config: SSOConfig;
  private credentials: SSOCredentials;
  private discoveryCache: Map<string, OIDCDiscovery> = new Map();

  constructor(config: SSOConfig, credentials: SSOCredentials) {
    this.config = config;
    this.credentials = credentials;
  }

  isConfigured(): boolean {
    if (this.config.provider === "oidc") {
      return !!(
        this.config.oidcIssuerUrl &&
        this.config.oidcClientId &&
        this.config.oidcClientSecret
      );
    } else if (this.config.provider === "saml") {
      return !!(
        this.config.samlEntryPoint &&
        this.config.samlIssuer &&
        this.config.samlCertificate
      );
    }
    return false;
  }

  async getOIDCDiscovery(issuerUrl: string): Promise<OIDCDiscovery | null> {
    if (this.discoveryCache.has(issuerUrl)) {
      return this.discoveryCache.get(issuerUrl)!;
    }

    try {
      const wellKnownUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
      const response = await fetch(wellKnownUrl);
      
      if (!response.ok) {
        console.error(`Failed to fetch OIDC discovery: ${response.status}`);
        return null;
      }

      const discovery = await response.json() as OIDCDiscovery;
      this.discoveryCache.set(issuerUrl, discovery);
      return discovery;
    } catch (error) {
      console.error("OIDC discovery error:", error);
      return null;
    }
  }

  generateState(kbId: string): string {
    const stateData = {
      kbId,
      nonce: crypto.randomBytes(16).toString("hex"),
      timestamp: Date.now(),
    };
    const payload = Buffer.from(JSON.stringify(stateData)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", STATE_SECRET)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  parseState(state: string): { kbId: string; nonce: string; timestamp: number } | null {
    try {
      const parts = state.split(".");
      if (parts.length !== 2) {
        console.error("Invalid state format: missing signature");
        return null;
      }

      const [payload, signature] = parts;
      const expectedSignature = crypto
        .createHmac("sha256", STATE_SECRET)
        .update(payload)
        .digest("base64url");

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error("State signature verification failed");
        return null;
      }

      const decoded = Buffer.from(payload, "base64url").toString("utf8");
      const stateData = JSON.parse(decoded);

      if (Date.now() - stateData.timestamp > STATE_EXPIRY_MS) {
        console.error("State expired");
        return null;
      }

      return stateData;
    } catch (error) {
      console.error("State parsing error:", error);
      return null;
    }
  }

  async getOIDCAuthUrl(kbId: string): Promise<string | null> {
    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId) {
      return null;
    }

    const discovery = await this.getOIDCDiscovery(this.config.oidcIssuerUrl);
    if (!discovery) {
      return null;
    }

    const state = this.generateState(kbId);
    const nonce = crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.oidcClientId,
      redirect_uri: this.credentials.callbackUrl,
      scope: "openid email profile",
      state,
      nonce,
    });

    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  async exchangeOIDCCode(code: string): Promise<OIDCTokenResponse | null> {
    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId || !this.config.oidcClientSecret) {
      return null;
    }

    const discovery = await this.getOIDCDiscovery(this.config.oidcIssuerUrl);
    if (!discovery) {
      return null;
    }

    try {
      const response = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${this.config.oidcClientId}:${this.config.oidcClientSecret}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.credentials.callbackUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OIDC token exchange failed:", error);
        return null;
      }

      return await response.json() as OIDCTokenResponse;
    } catch (error) {
      console.error("OIDC token exchange error:", error);
      return null;
    }
  }

  async getOIDCUserInfo(accessToken: string): Promise<OIDCUserInfo | null> {
    if (!this.config.oidcIssuerUrl) {
      return null;
    }

    const discovery = await this.getOIDCDiscovery(this.config.oidcIssuerUrl);
    if (!discovery) {
      return null;
    }

    try {
      const response = await fetch(discovery.userinfo_endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch user info:", response.status);
        return null;
      }

      return await response.json() as OIDCUserInfo;
    } catch (error) {
      console.error("User info fetch error:", error);
      return null;
    }
  }

  getSAMLAuthUrl(kbId: string): string | null {
    if (!this.config.samlEntryPoint || !this.config.samlIssuer) {
      return null;
    }

    const relayState = this.generateState(kbId);
    const samlRequest = this.generateSAMLRequest();

    const params = new URLSearchParams({
      SAMLRequest: samlRequest,
      RelayState: relayState,
    });

    return `${this.config.samlEntryPoint}?${params.toString()}`;
  }

  private generateSAMLRequest(): string {
    const id = `_${crypto.randomBytes(16).toString("hex")}`;
    const issueInstant = new Date().toISOString();
    const destination = this.config.samlEntryPoint || "";
    const issuer = this.config.samlIssuer || "";
    const callbackUrl = this.credentials.callbackUrl;

    const samlRequest = `
      <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${id}"
        Version="2.0"
        IssueInstant="${issueInstant}"
        Destination="${destination}"
        AssertionConsumerServiceURL="${callbackUrl}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>${issuer}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
      </samlp:AuthnRequest>
    `.replace(/\s+/g, " ").trim();

    const deflated = Buffer.from(samlRequest);
    return deflated.toString("base64");
  }

  parseSAMLResponse(samlResponse: string): SAMLAssertion | null {
    try {
      const decoded = Buffer.from(samlResponse, "base64").toString("utf8");
      
      const nameIdMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
      if (!nameIdMatch) {
        console.error("No NameID found in SAML response");
        return null;
      }

      const sessionIndexMatch = decoded.match(/SessionIndex="([^"]+)"/);
      
      const attributes: Record<string, string | string[]> = {};
      const attrRegex = /<saml:Attribute Name="([^"]+)"[^>]*>\s*<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/g;
      let match;
      while ((match = attrRegex.exec(decoded)) !== null) {
        const [, name, value] = match;
        if (attributes[name]) {
          if (Array.isArray(attributes[name])) {
            (attributes[name] as string[]).push(value);
          } else {
            attributes[name] = [attributes[name] as string, value];
          }
        } else {
          attributes[name] = value;
        }
      }

      return {
        nameId: nameIdMatch[1],
        sessionIndex: sessionIndexMatch?.[1],
        attributes,
      };
    } catch (error) {
      console.error("SAML response parse error:", error);
      return null;
    }
  }

  verifySAMLSignature(samlResponse: string): { valid: boolean; issuer?: string; error?: string } {
    if (!this.config.samlCertificate) {
      return { valid: false, error: "No IdP certificate configured" };
    }

    try {
      const decoded = Buffer.from(samlResponse, "base64").toString("utf8");
      
      const signatureMatch = decoded.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/);
      if (!signatureMatch) {
        return { valid: false, error: "No signature found in SAML response" };
      }

      const issuerMatch = decoded.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/);
      const responseIssuer = issuerMatch?.[1];

      const certMatch = decoded.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);
      if (certMatch) {
        const responseCert = certMatch[1].replace(/\s/g, "");
        const configCert = this.config.samlCertificate
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s/g, "");

        if (responseCert !== configCert) {
          return { valid: false, error: "Certificate in response does not match configured IdP certificate" };
        }
      }

      const conditionsMatch = decoded.match(/<saml:Conditions[^>]*NotOnOrAfter="([^"]+)"/);
      if (conditionsMatch) {
        const notOnOrAfter = new Date(conditionsMatch[1]);
        if (new Date() > notOnOrAfter) {
          return { valid: false, error: "SAML assertion has expired" };
        }
      }

      const notBeforeMatch = decoded.match(/<saml:Conditions[^>]*NotBefore="([^"]+)"/);
      if (notBeforeMatch) {
        const notBefore = new Date(notBeforeMatch[1]);
        if (new Date() < notBefore) {
          return { valid: false, error: "SAML assertion is not yet valid" };
        }
      }

      return { valid: true, issuer: responseIssuer };
    } catch (error) {
      console.error("SAML signature verification error:", error);
      return { valid: false, error: `Verification failed: ${error}` };
    }
  }

  isEmailDomainAllowed(email: string): boolean {
    if (!this.config.allowedDomains || this.config.allowedDomains.length === 0) {
      return true;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      return false;
    }

    return this.config.allowedDomains.some(
      (allowed) => allowed.toLowerCase() === domain
    );
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.config.provider === "oidc") {
      if (!this.config.oidcIssuerUrl) {
        return { success: false, message: "OIDC issuer URL is required" };
      }

      const discovery = await this.getOIDCDiscovery(this.config.oidcIssuerUrl);
      if (!discovery) {
        return { success: false, message: "Failed to fetch OIDC discovery document" };
      }

      if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
        return { success: false, message: "Invalid OIDC discovery document" };
      }

      return { 
        success: true, 
        message: `Connected to ${discovery.issuer}` 
      };
    } else if (this.config.provider === "saml") {
      if (!this.config.samlEntryPoint) {
        return { success: false, message: "SAML entry point URL is required" };
      }

      try {
        const response = await fetch(this.config.samlEntryPoint, { method: "HEAD" });
        if (response.ok || response.status === 405) {
          return { success: true, message: "SAML endpoint is reachable" };
        }
        return { success: false, message: `SAML endpoint returned ${response.status}` };
      } catch {
        return { success: false, message: "Failed to reach SAML endpoint" };
      }
    }

    return { success: false, message: "Unknown provider type" };
  }

  getServiceProviderMetadata(kbId: string, baseUrl: string): string {
    const entityId = `${baseUrl}/api/sso/metadata/${kbId}`;
    const acsUrl = `${baseUrl}/api/sso/callback/saml`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  }
}

export function createSSOService(config: SSOConfig, callbackUrl: string): SSOService {
  return new SSOService(config, { callbackUrl });
}

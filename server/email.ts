/**
 * Email Service Abstraction Layer
 * 
 * This module provides a flexible email sending framework that can be easily
 * integrated with any email service provider (SendGrid, Mailgun, Resend, etc.)
 * 
 * To integrate a real email service:
 * 1. Implement the EmailProvider interface
 * 2. Replace the MockEmailProvider with your implementation
 * 3. Add the necessary API key as an environment variable
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<EmailResult>;
}

/**
 * Mock Email Provider for Development
 * Logs emails to console instead of sending them
 */
class MockEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<EmailResult> {
    console.log("\n📧 [EMAIL SERVICE - MOCK MODE]");
    console.log("━".repeat(50));
    console.log(`To: ${options.to}`);
    console.log(`From: ${options.from || "noreply@yourapp.com"}`);
    console.log(`Subject: ${options.subject}`);
    console.log("━".repeat(50));
    console.log("Text Content:");
    console.log(options.text || "(no text version)");
    console.log("━".repeat(50));
    console.log("HTML Content: [Rendered HTML email]");
    console.log("━".repeat(50));
    console.log("📧 [END OF EMAIL]\n");

    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
  }
}

/**
 * SendGrid Email Provider Template
 * Uncomment and configure when ready to use SendGrid
 * 
 * Required: SENDGRID_API_KEY environment variable
 */
/*
class SendGridProvider implements EmailProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: SENDGRID_API_KEY not set");
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: options.from || "noreply@yourapp.com" },
          subject: options.subject,
          content: [
            { type: "text/plain", value: options.text || "" },
            { type: "text/html", value: options.html },
          ],
        }),
      });

      if (response.ok) {
        return { success: true, messageId: response.headers.get("x-message-id") || undefined };
      } else {
        const error = await response.text();
        return { success: false, error };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
*/

/**
 * Resend Email Provider Template
 * Uncomment and configure when ready to use Resend
 * 
 * Required: RESEND_API_KEY environment variable
 */
/*
class ResendProvider implements EmailProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: RESEND_API_KEY not set");
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from || "noreply@yourapp.com",
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, messageId: data.id };
      } else {
        return { success: false, error: data.message || "Failed to send" };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
*/

// Email Service singleton
class EmailService {
  private provider: EmailProvider;

  constructor() {
    // Switch provider based on environment or configuration
    // For now, use mock provider for development
    this.provider = new MockEmailProvider();

    // To use a real provider, uncomment one of the following:
    // this.provider = new SendGridProvider();
    // this.provider = new ResendProvider();
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    return this.provider.send(options);
  }

  /**
   * Send a team invitation email
   */
  async sendTeamInvite(params: {
    toEmail: string;
    inviterName: string;
    knowledgeBaseName: string;
    role: string;
    inviteUrl: string;
  }): Promise<EmailResult> {
    const { toEmail, inviterName, knowledgeBaseName, role, inviteUrl } = params;

    const subject = `You've been invited to join ${knowledgeBaseName}`;

    const html = generateInviteEmailHtml({
      inviterName,
      knowledgeBaseName,
      role,
      inviteUrl,
    });

    const text = generateInviteEmailText({
      inviterName,
      knowledgeBaseName,
      role,
      inviteUrl,
    });

    return this.send({
      to: toEmail,
      subject,
      html,
      text,
    });
  }
}

/**
 * Generate branded HTML email for team invitations
 */
function generateInviteEmailHtml(params: {
  inviterName: string;
  knowledgeBaseName: string;
  role: string;
  inviteUrl: string;
}): string {
  const { inviterName, knowledgeBaseName, role, inviteUrl } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="width: 48px; height: 48px; background-color: #18181b; border-radius: 8px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">K</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                You're Invited!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                <strong>${inviterName}</strong> has invited you to join <strong>${knowledgeBaseName}</strong> as a <strong>${role}</strong>.
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Click the button below to accept this invitation and get started.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center; padding: 10px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 8px 0 0; font-size: 14px; line-height: 20px; color: #3b82f6; word-break: break-all;">
                ${inviteUrl}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #a1a1aa; text-align: center;">
                This invitation was sent to you because someone invited you to collaborate. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for team invitations
 */
function generateInviteEmailText(params: {
  inviterName: string;
  knowledgeBaseName: string;
  role: string;
  inviteUrl: string;
}): string {
  const { inviterName, knowledgeBaseName, role, inviteUrl } = params;

  return `
You're Invited!

${inviterName} has invited you to join ${knowledgeBaseName} as a ${role}.

Click the link below to accept this invitation and get started:

${inviteUrl}

---

This invitation was sent to you because someone invited you to collaborate. If you didn't expect this invitation, you can safely ignore this email.
  `.trim();
}

// Export singleton instance
export const emailService = new EmailService();

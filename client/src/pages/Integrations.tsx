import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useKnowledgeBase } from "@/context/KnowledgeBaseContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Server, 
  MessageSquare, 
  Plug2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Loader2,
  Workflow,
  MessagesSquare,
  Headphones,
  ShieldCheck,
  Key,
  Copy
} from "lucide-react";
import { z } from "zod";
import type { Integration } from "@shared/schema";

const serviceNowFormSchema = z.object({
  instanceUrl: z.string().url("Please enter a valid URL").or(z.literal("")),
  incidentFormEnabled: z.boolean(),
  autoSync: z.boolean(),
});

type ServiceNowFormValues = z.infer<typeof serviceNowFormSchema>;

const ssoFormSchema = z.object({
  provider: z.enum(["oidc", "saml"]),
  providerName: z.string().optional(),
  oidcIssuerUrl: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
  oidcClientId: z.string().optional(),
  oidcClientSecret: z.string().optional(),
  samlEntryPoint: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
  samlIssuer: z.string().optional(),
  samlCertificate: z.string().optional(),
  enforceForTeam: z.boolean(),
  allowedDomains: z.string().optional(),
  autoProvision: z.boolean(),
  defaultRole: z.enum(["viewer", "contributor", "admin"]),
});

type SSOFormValues = z.infer<typeof ssoFormSchema>;

export default function Integrations() {
  const { toast } = useToast();
  const { selectedKnowledgeBase, getApiUrl, isLoading: isKbLoading, isReady } = useKnowledgeBase();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  const { data: integrations, isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations", selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/integrations"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch integrations");
      return res.json();
    },
    enabled: !!selectedKnowledgeBase,
  });

  const serviceNowIntegration = integrations?.find(i => i.type === "servicenow");
  const serviceNowConfig = (serviceNowIntegration?.config as Record<string, unknown>) || {};

  const slackIntegration = integrations?.find(i => i.type === "slack");
  const slackConfig = (slackIntegration?.config as Record<string, unknown>) || {};
  const [slackConnecting, setSlackConnecting] = useState(false);

  const ssoIntegration = integrations?.find(i => i.type === "sso");
  const ssoConfig = (ssoIntegration?.config as Record<string, unknown>) || {};
  const [ssoTestStatus, setSsoTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testingSso, setTestingSso] = useState(false);

  const teamsIntegration = integrations?.find(i => i.type === "teams");
  const teamsConfig = (teamsIntegration?.config as Record<string, unknown>) || {};
  const [teamsConnecting, setTeamsConnecting] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>((teamsConfig.teamId as string) || "");
  const [selectedChannelId, setSelectedChannelId] = useState<string>((teamsConfig.channelId as string) || "");
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState<string>((teamsConfig.webhookUrl as string) || "");

  const helpdeskIntegration = integrations?.find(i => i.type === "helpdesk");
  const helpdeskConfig = (helpdeskIntegration?.config as Record<string, unknown>) || {};
  const [helpdeskTestStatus, setHelpdeskTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [testingHelpdesk, setTestingHelpdesk] = useState(false);
  const [helpdeskProvider, setHelpdeskProvider] = useState<'zendesk' | 'freshdesk'>('zendesk');
  const [helpdeskSubdomain, setHelpdeskSubdomain] = useState<string>("");
  const [helpdeskEmail, setHelpdeskEmail] = useState<string>("");
  const [helpdeskApiToken, setHelpdeskApiToken] = useState<string>("");
  const [helpdeskApiKey, setHelpdeskApiKey] = useState<string>("");
  const [helpdeskDefaultSection, setHelpdeskDefaultSection] = useState<string>("");
  const [helpdeskConfigLoaded, setHelpdeskConfigLoaded] = useState(false);

  // API Key management state
  const [newApiKeyName, setNewApiKeyName] = useState<string>("");
  const [newApiKeyScopes, setNewApiKeyScopes] = useState<string[]>(["read"]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // API Key types
  interface ApiKeyInfo {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    rateLimitOverride: number | null;
    requestCount: number;
    lastUsedAt: string | null;
    createdAt: string;
    key?: string;
  }

  // Query for API keys
  const { data: apiKeys, isLoading: apiKeysLoading, refetch: refetchApiKeys } = useQuery<ApiKeyInfo[]>({
    queryKey: ["/api/integrations/public-api/keys", selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/integrations/public-api/keys"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
    enabled: !!selectedKnowledgeBase,
  });

  // Mutation for creating API keys
  const createApiKeyMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/public-api/keys"), data);
      return res;
    },
    onSuccess: (data: ApiKeyInfo) => {
      setNewlyCreatedKey(data.key || null);
      setNewApiKeyName("");
      setNewApiKeyScopes(["read"]);
      refetchApiKeys();
      toast({
        title: "API Key Created",
        description: "Make sure to copy your key now - it won't be shown again!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  // Mutation for revoking API keys
  const revokeApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", getApiUrl(`/api/integrations/public-api/keys/${keyId}`));
    },
    onSuccess: () => {
      refetchApiKeys();
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked and can no longer be used.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  // Mutation for regenerating API keys
  const regenerateApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiRequest("POST", getApiUrl(`/api/integrations/public-api/keys/${keyId}/regenerate`));
      return res;
    },
    onSuccess: (data: ApiKeyInfo) => {
      setNewlyCreatedKey(data.key || null);
      refetchApiKeys();
      toast({
        title: "API Key Regenerated",
        description: "Your old key has been revoked. Copy the new key now!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to regenerate API key",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (keyId) {
        setCopiedKeyId(keyId);
        setTimeout(() => setCopiedKeyId(null), 2000);
      }
      toast({
        title: "Copied",
        description: "Copied to clipboard",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (helpdeskIntegration && !helpdeskConfigLoaded) {
      const config = (helpdeskIntegration.config as Record<string, unknown>) || {};
      setHelpdeskProvider((config.provider as 'zendesk' | 'freshdesk') || 'zendesk');
      setHelpdeskSubdomain((config.subdomain as string) || "");
      setHelpdeskEmail((config.email as string) || "");
      setHelpdeskDefaultSection((config.defaultSectionId as string) || "");
      setHelpdeskConfigLoaded(true);
    }
  }, [helpdeskIntegration, helpdeskConfigLoaded]);

  useEffect(() => {
    if (selectedKnowledgeBase) {
      setHelpdeskConfigLoaded(false);
      setHelpdeskTestStatus(null);
      setHelpdeskProvider('zendesk');
      setHelpdeskSubdomain("");
      setHelpdeskEmail("");
      setHelpdeskApiToken("");
      setHelpdeskApiKey("");
      setHelpdeskDefaultSection("");
    }
  }, [selectedKnowledgeBase?.id]);

  const form = useForm<ServiceNowFormValues>({
    resolver: zodResolver(serviceNowFormSchema),
    defaultValues: {
      instanceUrl: (serviceNowConfig.instanceUrl as string) || "",
      incidentFormEnabled: (serviceNowConfig.incidentFormEnabled as boolean) || false,
      autoSync: (serviceNowConfig.autoSync as boolean) || false,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ServiceNowFormValues & { enabled: boolean }) => {
      await apiRequest("PUT", getApiUrl("/api/integrations/servicenow"), {
        enabled: data.enabled,
        config: {
          instanceUrl: data.instanceUrl,
          incidentFormEnabled: data.incidentFormEnabled,
          autoSync: data.autoSync,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Success",
        description: "ServiceNow integration saved",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save integration",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/servicenow/sync"));
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Complete",
        description: `Synced ${data.synced} articles. ${data.failed > 0 ? `${data.failed} failed.` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectSlack = async () => {
    setSlackConnecting(true);
    try {
      const res = await fetch(getApiUrl("/api/integrations/slack/oauth/url"), { credentials: "include" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to get Slack authorization URL",
          variant: "destructive",
        });
        setSlackConnecting(false);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setSlackConnecting(false);
    }
  };

  const slackDisconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", getApiUrl("/api/integrations/slack/disconnect"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Disconnected",
        description: "Slack workspace disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const slackConfigMutation = useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      await apiRequest("PUT", getApiUrl("/api/integrations/slack/config"), config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Success",
        description: "Slack settings updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const slackTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/slack/test"));
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Success" : "Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const ssoForm = useForm<SSOFormValues>({
    resolver: zodResolver(ssoFormSchema),
    defaultValues: {
      provider: (ssoConfig.provider as "oidc" | "saml") || "oidc",
      providerName: (ssoConfig.providerName as string) || "",
      oidcIssuerUrl: (ssoConfig.oidcIssuerUrl as string) || "",
      oidcClientId: (ssoConfig.oidcClientId as string) || "",
      oidcClientSecret: "",
      samlEntryPoint: (ssoConfig.samlEntryPoint as string) || "",
      samlIssuer: (ssoConfig.samlIssuer as string) || "",
      samlCertificate: "",
      enforceForTeam: (ssoConfig.enforceForTeam as boolean) || false,
      allowedDomains: ((ssoConfig.allowedDomains as string[]) || []).join(", "),
      autoProvision: (ssoConfig.autoProvision as boolean) ?? true,
      defaultRole: (ssoConfig.defaultRole as "viewer" | "contributor" | "admin") || "viewer",
    },
  });

  const ssoSaveMutation = useMutation({
    mutationFn: async (data: SSOFormValues & { enabled: boolean }) => {
      const config: Record<string, unknown> = {
        provider: data.provider,
        providerName: data.providerName,
        enforceForTeam: data.enforceForTeam,
        autoProvision: data.autoProvision,
        defaultRole: data.defaultRole,
        allowedDomains: data.allowedDomains ? data.allowedDomains.split(",").map(d => d.trim()).filter(Boolean) : [],
      };

      if (data.provider === "oidc") {
        config.oidcIssuerUrl = data.oidcIssuerUrl;
        config.oidcClientId = data.oidcClientId;
        if (data.oidcClientSecret) {
          config.oidcClientSecret = data.oidcClientSecret;
        }
      } else {
        config.samlEntryPoint = data.samlEntryPoint;
        config.samlIssuer = data.samlIssuer;
        if (data.samlCertificate) {
          config.samlCertificate = data.samlCertificate;
        }
      }

      await apiRequest("PUT", getApiUrl("/api/integrations/sso"), {
        enabled: data.enabled,
        config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Success",
        description: "SSO configuration saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testSsoConnection = async () => {
    setTestingSso(true);
    setSsoTestStatus(null);

    try {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/sso/test"));
      const result = await res.json();
      setSsoTestStatus(result);
    } catch (error: any) {
      setSsoTestStatus({ success: false, message: error.message });
    } finally {
      setTestingSso(false);
    }
  };

  const toggleSsoEnabled = (enabled: boolean) => {
    const values = ssoForm.getValues();
    ssoSaveMutation.mutate({ ...values, enabled });
  };

  const onSsoSubmit = (data: SSOFormValues) => {
    ssoSaveMutation.mutate({ ...data, enabled: ssoIntegration?.enabled ?? false });
  };

  const copySsoLoginUrl = () => {
    if (!selectedKnowledgeBase) return;
    const url = `${window.location.origin}/api/sso/login/${selectedKnowledgeBase.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied",
      description: "SSO login URL copied to clipboard",
    });
  };

  const copyMetadataUrl = () => {
    if (!selectedKnowledgeBase) return;
    const url = `${window.location.origin}/api/sso/metadata/${selectedKnowledgeBase.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied",
      description: "SP Metadata URL copied to clipboard",
    });
  };

  const connectTeams = async () => {
    setTeamsConnecting(true);
    try {
      const res = await fetch(getApiUrl("/api/integrations/teams/oauth/url"), { credentials: "include" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to get Teams authorization URL",
          variant: "destructive",
        });
        setTeamsConnecting(false);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setTeamsConnecting(false);
    }
  };

  const teamsDisconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", getApiUrl("/api/integrations/teams/disconnect"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Disconnected",
        description: "Microsoft Teams disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const teamsConfigMutation = useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      await apiRequest("PUT", getApiUrl("/api/integrations/teams/config"), config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Success",
        description: "Teams settings updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const teamsTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/teams/test"));
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Success" : "Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const teamsWebhookSaveMutation = useMutation({
    mutationFn: async (webhookUrl: string) => {
      await apiRequest("PUT", getApiUrl("/api/integrations/teams/webhook"), { webhookUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({
        title: "Success",
        description: "Webhook URL saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const helpdeskSaveMutation = useMutation({
    mutationFn: async (data: { provider: string; subdomain: string; email: string; apiToken?: string; apiKey?: string; defaultSectionId?: string }) => {
      await apiRequest("PUT", getApiUrl("/api/integrations/helpdesk"), {
        enabled: true,
        config: {
          provider: data.provider,
          subdomain: data.subdomain,
          email: data.email,
          apiToken: data.apiToken,
          apiKey: data.apiKey,
          defaultSectionId: data.defaultSectionId,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      toast({ title: "Success", description: "Helpdesk configuration saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const helpdeskDisconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", getApiUrl("/api/integrations/helpdesk/disconnect"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", selectedKnowledgeBase?.id] });
      setHelpdeskTestStatus(null);
      toast({ title: "Disconnected", description: "Helpdesk integration removed" });
    },
  });

  const helpdeskImportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/helpdesk/import"));
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/helpdesk/sync-jobs", selectedKnowledgeBase?.id] });
      toast({ title: "Import Started", description: `Job ID: ${data.jobId}` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const helpdeskExportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/helpdesk/export"));
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/helpdesk/sync-jobs", selectedKnowledgeBase?.id] });
      toast({ title: "Export Started", description: `Job ID: ${data.jobId}` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: syncJobs, isLoading: syncJobsLoading } = useQuery<Array<{
    id: string;
    provider: string;
    direction: string;
    status: string;
    totalItems: number;
    processedItems: number;
    createdItems: number;
    updatedItems: number;
    skippedItems: number;
    failedItems: number;
    createdAt: string;
  }>>({
    queryKey: ["/api/integrations/helpdesk/sync-jobs", selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/integrations/helpdesk/sync-jobs"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedKnowledgeBase && !!helpdeskIntegration,
  });

  const { data: remoteCategories } = useQuery<{
    categories?: Array<{ id: number; name: string }>;
    sections?: Array<{ id: number; name: string; category_id: number }>;
    folders?: Array<{ id: number; name: string; categoryName: string }>;
  }>({
    queryKey: ["/api/integrations/helpdesk/remote-categories", selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/integrations/helpdesk/remote-categories"), { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!selectedKnowledgeBase && !!helpdeskIntegration?.enabled,
  });

  const testHelpdeskConnection = async () => {
    setTestingHelpdesk(true);
    setHelpdeskTestStatus(null);
    try {
      const res = await fetch(getApiUrl("/api/integrations/helpdesk/test"), {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setHelpdeskTestStatus(data);
    } catch (error: any) {
      setHelpdeskTestStatus({ success: false, message: error.message });
    } finally {
      setTestingHelpdesk(false);
    }
  };

  const { data: teamsTeams, isLoading: teamsTeamsLoading } = useQuery<Array<{ id: string; displayName: string }>>({
    queryKey: ["/api/integrations/teams/teams", selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/integrations/teams/teams"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!teamsIntegration?.enabled,
  });

  const { data: teamsChannels, isLoading: teamsChannelsLoading } = useQuery<Array<{ id: string; displayName: string }>>({
    queryKey: ["/api/integrations/teams/channels", selectedKnowledgeBase?.id, selectedTeamId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/integrations/teams/channels`) + `&teamId=${selectedTeamId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!teamsIntegration?.enabled && !!selectedTeamId,
  });

  const testConnection = async () => {
    const instanceUrl = form.getValues("instanceUrl");
    if (!instanceUrl) {
      toast({
        title: "Error",
        description: "Please enter an instance URL first",
        variant: "destructive",
      });
      return;
    }

    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const res = await apiRequest("POST", getApiUrl("/api/integrations/servicenow/test"), {
        instanceUrl,
      });
      const result = await res.json();
      setConnectionStatus(result);
    } catch (error: any) {
      setConnectionStatus({ success: false, message: error.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const toggleEnabled = (enabled: boolean) => {
    const values = form.getValues();
    saveMutation.mutate({ ...values, enabled });
  };

  const onSubmit = (data: ServiceNowFormValues) => {
    saveMutation.mutate({ ...data, enabled: serviceNowIntegration?.enabled ?? false });
  };

  if (isKbLoading || !isReady) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-muted-foreground">Connect your knowledge base with external services</p>
      </div>

      <Tabs defaultValue="servicenow" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="servicenow" className="gap-2" data-testid="tab-servicenow">
            <Workflow className="w-4 h-4" />
            <span className="hidden sm:inline">ServiceNow</span>
          </TabsTrigger>
          <TabsTrigger value="slack" className="gap-2" data-testid="tab-slack">
            <MessagesSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Slack</span>
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2" data-testid="tab-teams">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Teams</span>
          </TabsTrigger>
          <TabsTrigger value="sso" className="gap-2" data-testid="tab-sso">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">SSO</span>
          </TabsTrigger>
          <TabsTrigger value="zendesk" className="gap-2" data-testid="tab-zendesk">
            <Headphones className="w-4 h-4" />
            <span className="hidden sm:inline">Helpdesk</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2" data-testid="tab-api">
            <Plug2 className="w-4 h-4" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servicenow" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Workflow className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      ServiceNow
                      {serviceNowIntegration?.enabled && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Sync articles and create incidents</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={serviceNowIntegration?.enabled ?? false}
                  onCheckedChange={toggleEnabled}
                  disabled={saveMutation.isPending}
                  data-testid="switch-servicenow-enabled"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Alert className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Credentials Required</AlertTitle>
                <AlertDescription>
                  To use this integration, add SERVICENOW_USERNAME and SERVICENOW_PASSWORD to your secrets.
                  These credentials should have access to the ServiceNow REST API.
                </AlertDescription>
              </Alert>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="instanceUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instance URL</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              {...field}
                              placeholder="https://your-instance.service-now.com"
                              data-testid="input-servicenow-url"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={testConnection}
                              disabled={testingConnection || !field.value}
                              data-testid="button-test-connection"
                            >
                              {testingConnection ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Test"
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>Your ServiceNow instance URL</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {connectionStatus && (
                    <Alert variant={connectionStatus.success ? "default" : "destructive"}>
                      {connectionStatus.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>{connectionStatus.success ? "Connected" : "Connection Failed"}</AlertTitle>
                      <AlertDescription>{connectionStatus.message}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="incidentFormEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Incident Form</FormLabel>
                            <FormDescription>
                              Show "Create Incident" button on public articles
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-incident-form"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="autoSync"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Auto Sync</FormLabel>
                            <FormDescription>
                              Automatically sync articles when published
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-auto-sync"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={saveMutation.isPending}
                      data-testid="button-save-servicenow"
                    >
                      {saveMutation.isPending ? "Saving..." : "Save Configuration"}
                    </Button>

                    {serviceNowIntegration?.enabled && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        data-testid="button-sync-now"
                      >
                        {syncMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Sync Now
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {serviceNowIntegration?.lastSyncAt && (
                    <p className="text-sm text-muted-foreground">
                      Last synced: {new Date(serviceNowIntegration.lastSyncAt).toLocaleString()}
                    </p>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slack" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <MessagesSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Slack
                      {slackIntegration?.enabled && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                          Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Search articles from Slack with slash commands</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Credentials Required</AlertTitle>
                <AlertDescription>
                  To use this integration, add SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET to your secrets.
                  Get these from your Slack App configuration at api.slack.com/apps.
                </AlertDescription>
              </Alert>

              {!slackIntegration?.enabled ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <MessagesSquare className="w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground text-center max-w-md">
                    Connect your Slack workspace to enable article search via the /kb slash command
                  </p>
                  <Button
                    onClick={connectSlack}
                    disabled={slackConnecting}
                    data-testid="button-connect-slack"
                  >
                    {slackConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Add to Slack"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{(slackConfig.teamName as string) || "Connected Workspace"}</p>
                        {typeof slackConfig.channelName === "string" && slackConfig.channelName && (
                          <p className="text-sm text-muted-foreground">
                            Channel: #{slackConfig.channelName}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => slackDisconnectMutation.mutate()}
                        disabled={slackDisconnectMutation.isPending}
                        data-testid="button-disconnect-slack"
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <p className="text-base font-medium">Slash Command</p>
                        <p className="text-sm text-muted-foreground">
                          Enable /kb search command in Slack
                        </p>
                      </div>
                      <Switch
                        checked={(slackConfig.slashCommandEnabled as boolean) ?? true}
                        onCheckedChange={(checked) => 
                          slackConfigMutation.mutate({ slashCommandEnabled: checked })
                        }
                        disabled={slackConfigMutation.isPending}
                        data-testid="switch-slack-slash-command"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <p className="text-base font-medium">Publish Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Post when articles are published
                        </p>
                      </div>
                      <Switch
                        checked={(slackConfig.notifyOnPublish as boolean) ?? false}
                        onCheckedChange={(checked) => 
                          slackConfigMutation.mutate({ notifyOnPublish: checked })
                        }
                        disabled={slackConfigMutation.isPending}
                        data-testid="switch-slack-notify-publish"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => slackTestMutation.mutate()}
                      disabled={slackTestMutation.isPending || !slackConfig.channelId}
                      data-testid="button-test-slack"
                    >
                      {slackTestMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        "Send Test Message"
                      )}
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm font-medium mb-2">Slash Command Webhook URL</p>
                    <code className="text-xs bg-background p-2 rounded block break-all">
                      {window.location.origin}/api/slack/commands
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Configure this URL in your Slack App under "Slash Commands"
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Microsoft Teams
                      {teamsIntegration?.enabled && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Search articles and receive notifications in Teams</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Azure AD App Required</AlertTitle>
                <AlertDescription>
                  To use this integration, register an Azure AD application and add TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, and TEAMS_TENANT_ID to your secrets.
                  You can also use an incoming webhook URL for simpler notification-only setups.
                </AlertDescription>
              </Alert>

              {!teamsIntegration?.enabled ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <MessageSquare className="w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground text-center max-w-md">
                    Connect your Microsoft Teams workspace to enable article search and notifications
                  </p>
                  <Button
                    onClick={connectTeams}
                    disabled={teamsConnecting}
                    data-testid="button-connect-teams"
                  >
                    {teamsConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect Teams"
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">Or use a webhook URL below for notifications only</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{(teamsConfig.teamName as string) || "Connected Account"}</p>
                        {typeof teamsConfig.channelName === "string" && teamsConfig.channelName && (
                          <p className="text-sm text-muted-foreground">
                            Channel: {teamsConfig.channelName}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => teamsDisconnectMutation.mutate()}
                        disabled={teamsDisconnectMutation.isPending}
                        data-testid="button-disconnect-teams"
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Select Team</label>
                      <select
                        className="w-full p-2 rounded-md border bg-background"
                        value={selectedTeamId}
                        onChange={(e) => {
                          setSelectedTeamId(e.target.value);
                          setSelectedChannelId("");
                          const team = teamsTeams?.find(t => t.id === e.target.value);
                          if (team) {
                            teamsConfigMutation.mutate({ 
                              teamId: e.target.value, 
                              teamName: team.displayName 
                            });
                          }
                        }}
                        disabled={teamsTeamsLoading}
                        data-testid="select-teams-team"
                      >
                        <option value="">Select a team...</option>
                        {teamsTeams?.map(team => (
                          <option key={team.id} value={team.id}>{team.displayName}</option>
                        ))}
                      </select>
                    </div>

                    {selectedTeamId && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">Select Channel</label>
                        <select
                          className="w-full p-2 rounded-md border bg-background"
                          value={selectedChannelId}
                          onChange={(e) => {
                            setSelectedChannelId(e.target.value);
                            const channel = teamsChannels?.find(c => c.id === e.target.value);
                            if (channel) {
                              teamsConfigMutation.mutate({ 
                                channelId: e.target.value, 
                                channelName: channel.displayName 
                              });
                            }
                          }}
                          disabled={teamsChannelsLoading}
                          data-testid="select-teams-channel"
                        >
                          <option value="">Select a channel...</option>
                          {teamsChannels?.map(channel => (
                            <option key={channel.id} value={channel.id}>{channel.displayName}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <p className="text-base font-medium">Search Command</p>
                        <p className="text-sm text-muted-foreground">
                          Enable article search in Teams
                        </p>
                      </div>
                      <Switch
                        checked={(teamsConfig.searchEnabled as boolean) ?? false}
                        onCheckedChange={(checked) => 
                          teamsConfigMutation.mutate({ searchEnabled: checked })
                        }
                        disabled={teamsConfigMutation.isPending}
                        data-testid="switch-teams-search"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <p className="text-base font-medium">Publish Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Post when articles are published
                        </p>
                      </div>
                      <Switch
                        checked={(teamsConfig.notifyOnPublish as boolean) ?? false}
                        onCheckedChange={(checked) => 
                          teamsConfigMutation.mutate({ notifyOnPublish: checked })
                        }
                        disabled={teamsConfigMutation.isPending}
                        data-testid="switch-teams-notify-publish"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => teamsTestMutation.mutate()}
                      disabled={teamsTestMutation.isPending || (!teamsConfig.channelId && !teamsConfig.webhookUrl)}
                      data-testid="button-test-teams"
                    >
                      {teamsTestMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        "Send Test Message"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t pt-6">
                <p className="text-sm font-medium mb-3">Alternative: Use Incoming Webhook</p>
                <p className="text-sm text-muted-foreground mb-3">
                  For simple notification setups, paste an incoming webhook URL from Teams:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://outlook.webhook.office.com/..."
                    value={teamsWebhookUrl}
                    onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                    data-testid="input-teams-webhook"
                  />
                  <Button
                    onClick={() => teamsWebhookSaveMutation.mutate(teamsWebhookUrl)}
                    disabled={teamsWebhookSaveMutation.isPending || !teamsWebhookUrl.trim()}
                    data-testid="button-save-teams-webhook"
                  >
                    {teamsWebhookSaveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Create an incoming webhook in Teams: Channel Settings → Connectors → Incoming Webhook
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sso" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Single Sign-On (SSO)
                      {ssoIntegration?.enabled && (
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          Enabled
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Configure enterprise authentication with SAML 2.0 or OIDC</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={ssoIntegration?.enabled ?? false}
                  onCheckedChange={toggleSsoEnabled}
                  disabled={ssoSaveMutation.isPending}
                  data-testid="switch-sso-enabled"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Form {...ssoForm}>
                <form onSubmit={ssoForm.handleSubmit(onSsoSubmit)} className="space-y-6">
                  <FormField
                    control={ssoForm.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider Type</FormLabel>
                        <FormControl>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                {...field}
                                value="oidc"
                                checked={field.value === "oidc"}
                                onChange={() => field.onChange("oidc")}
                                className="w-4 h-4"
                              />
                              <span>OIDC / OAuth 2.0</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                {...field}
                                value="saml"
                                checked={field.value === "saml"}
                                onChange={() => field.onChange("saml")}
                                className="w-4 h-4"
                              />
                              <span>SAML 2.0</span>
                            </label>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Choose your identity provider protocol
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={ssoForm.control}
                    name="providerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider Name (optional)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., Okta, Azure AD, OneLogin"
                            data-testid="input-sso-provider-name"
                          />
                        </FormControl>
                        <FormDescription>Display name shown on login button</FormDescription>
                      </FormItem>
                    )}
                  />

                  {ssoForm.watch("provider") === "oidc" ? (
                    <>
                      <FormField
                        control={ssoForm.control}
                        name="oidcIssuerUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Issuer URL</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="https://your-provider.com/oauth2/default"
                                data-testid="input-oidc-issuer"
                              />
                            </FormControl>
                            <FormDescription>
                              The OIDC discovery URL (must have /.well-known/openid-configuration)
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={ssoForm.control}
                          name="oidcClientId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client ID</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Your OIDC client ID"
                                  data-testid="input-oidc-client-id"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={ssoForm.control}
                          name="oidcClientSecret"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client Secret</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="password"
                                  placeholder={ssoIntegration ? "••••••••" : "Your client secret"}
                                  data-testid="input-oidc-client-secret"
                                />
                              </FormControl>
                              <FormDescription>Leave blank to keep existing secret</FormDescription>
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <FormField
                        control={ssoForm.control}
                        name="samlEntryPoint"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IdP SSO URL</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="https://your-idp.com/sso/saml"
                                data-testid="input-saml-entry-point"
                              />
                            </FormControl>
                            <FormDescription>Your identity provider's SAML SSO endpoint</FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={ssoForm.control}
                        name="samlIssuer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SP Entity ID / Issuer</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder={selectedKnowledgeBase ? `${window.location.origin}/api/sso/metadata/${selectedKnowledgeBase.id}` : ""}
                                data-testid="input-saml-issuer"
                              />
                            </FormControl>
                            <FormDescription>Service provider entity ID</FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={ssoForm.control}
                        name="samlCertificate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IdP X.509 Certificate</FormLabel>
                            <FormControl>
                              <textarea
                                {...field}
                                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                                data-testid="input-saml-certificate"
                              />
                            </FormControl>
                            <FormDescription>Leave blank to keep existing certificate</FormDescription>
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-medium">User Provisioning</h4>
                    
                    <FormField
                      control={ssoForm.control}
                      name="allowedDomains"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allowed Email Domains (optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="company.com, subsidiary.com"
                              data-testid="input-sso-allowed-domains"
                            />
                          </FormControl>
                          <FormDescription>
                            Comma-separated list of allowed email domains. Leave empty to allow all.
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <p className="text-base font-medium">Auto-provision Users</p>
                          <p className="text-sm text-muted-foreground">
                            Create accounts on first SSO login
                          </p>
                        </div>
                        <Switch
                          checked={ssoForm.watch("autoProvision")}
                          onCheckedChange={(checked) => ssoForm.setValue("autoProvision", checked)}
                          data-testid="switch-sso-auto-provision"
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <p className="text-base font-medium">Enforce for Team</p>
                          <p className="text-sm text-muted-foreground">
                            Require SSO for all team members
                          </p>
                        </div>
                        <Switch
                          checked={ssoForm.watch("enforceForTeam")}
                          onCheckedChange={(checked) => ssoForm.setValue("enforceForTeam", checked)}
                          data-testid="switch-sso-enforce"
                        />
                      </div>
                    </div>

                    <FormField
                      control={ssoForm.control}
                      name="defaultRole"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Role for New Users</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              className="flex h-9 w-full max-w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              data-testid="select-sso-default-role"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="contributor">Contributor</option>
                              <option value="admin">Admin</option>
                            </select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {ssoTestStatus && (
                    <Alert variant={ssoTestStatus.success ? "default" : "destructive"}>
                      {ssoTestStatus.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>{ssoTestStatus.success ? "Connection Successful" : "Connection Failed"}</AlertTitle>
                      <AlertDescription>{ssoTestStatus.message}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={ssoSaveMutation.isPending}
                      data-testid="button-save-sso"
                    >
                      {ssoSaveMutation.isPending ? "Saving..." : "Save Configuration"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={testSsoConnection}
                      disabled={testingSso || !ssoIntegration}
                      data-testid="button-test-sso"
                    >
                      {testingSso ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        "Test Connection"
                      )}
                    </Button>
                  </div>

                  {ssoIntegration?.enabled && (
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="font-medium">Integration URLs</h4>
                      
                      <div className="p-4 rounded-lg bg-muted space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium">SSO Login URL</p>
                            <Button variant="ghost" size="sm" onClick={copySsoLoginUrl}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                          <code className="text-xs bg-background p-2 rounded block break-all">
                            {window.location.origin}/api/sso/login/{selectedKnowledgeBase?.id}
                          </code>
                        </div>

                        {ssoForm.watch("provider") === "saml" && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium">SP Metadata URL</p>
                              <Button variant="ghost" size="sm" onClick={copyMetadataUrl}>
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                            <code className="text-xs bg-background p-2 rounded block break-all">
                              {window.location.origin}/api/sso/metadata/{selectedKnowledgeBase?.id}
                            </code>
                            <p className="text-xs text-muted-foreground mt-1">
                              Use this URL to configure your IdP
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-sm font-medium mb-1">Callback URL</p>
                          <code className="text-xs bg-background p-2 rounded block break-all">
                            {window.location.origin}/api/sso/callback/{ssoForm.watch("provider")}
                          </code>
                          <p className="text-xs text-muted-foreground mt-1">
                            Configure this as your redirect/ACS URL in your IdP
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zendesk" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                    <Headphones className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Zendesk / Freshdesk
                      {helpdeskIntegration?.enabled && (
                        <Badge variant="secondary" className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                          Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Import and export articles to support platforms</CardDescription>
                  </div>
                </div>
                {helpdeskIntegration?.enabled && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => helpdeskDisconnectMutation.mutate()}
                    disabled={helpdeskDisconnectMutation.isPending}
                    data-testid="button-disconnect-helpdesk"
                  >
                    {helpdeskDisconnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>API Credentials Required</AlertTitle>
                <AlertDescription>
                  For Zendesk: Use your email and API token (Admin → Apps → API → Zendesk API).
                  For Freshdesk: Use your email and API key from profile settings.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Provider</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="helpdeskProvider"
                        value="zendesk"
                        checked={helpdeskProvider === "zendesk"}
                        onChange={() => setHelpdeskProvider("zendesk")}
                        className="w-4 h-4"
                        data-testid="radio-zendesk"
                      />
                      <span>Zendesk</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="helpdeskProvider"
                        value="freshdesk"
                        checked={helpdeskProvider === "freshdesk"}
                        onChange={() => setHelpdeskProvider("freshdesk")}
                        className="w-4 h-4"
                        data-testid="radio-freshdesk"
                      />
                      <span>Freshdesk</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {helpdeskProvider === "zendesk" ? "Subdomain" : "Domain"}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={helpdeskProvider === "zendesk" ? "your-company" : "your-company"}
                      value={helpdeskSubdomain}
                      onChange={(e) => setHelpdeskSubdomain(e.target.value)}
                      data-testid="input-helpdesk-subdomain"
                    />
                    <span className="text-sm text-muted-foreground">
                      .{helpdeskProvider === "zendesk" ? "zendesk.com" : "freshdesk.com"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Email</label>
                  <Input
                    type="email"
                    placeholder="admin@company.com"
                    value={helpdeskEmail}
                    onChange={(e) => setHelpdeskEmail(e.target.value)}
                    data-testid="input-helpdesk-email"
                  />
                </div>

                {helpdeskProvider === "zendesk" ? (
                  <div>
                    <label className="text-sm font-medium mb-2 block">API Token</label>
                    <Input
                      type="password"
                      placeholder="Enter your Zendesk API token"
                      value={helpdeskApiToken}
                      onChange={(e) => setHelpdeskApiToken(e.target.value)}
                      data-testid="input-helpdesk-apitoken"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Found in Admin → Channels → API
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium mb-2 block">API Key</label>
                    <Input
                      type="password"
                      placeholder="Enter your Freshdesk API key"
                      value={helpdeskApiKey}
                      onChange={(e) => setHelpdeskApiKey(e.target.value)}
                      data-testid="input-helpdesk-apikey"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Found in Profile Settings → API Key
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => helpdeskSaveMutation.mutate({
                      provider: helpdeskProvider,
                      subdomain: helpdeskSubdomain,
                      email: helpdeskEmail,
                      apiToken: helpdeskApiToken || undefined,
                      apiKey: helpdeskApiKey || undefined,
                      defaultSectionId: helpdeskDefaultSection || undefined,
                    })}
                    disabled={helpdeskSaveMutation.isPending || !helpdeskSubdomain || !helpdeskEmail || (helpdeskProvider === "zendesk" ? !helpdeskApiToken : !helpdeskApiKey)}
                    data-testid="button-save-helpdesk"
                  >
                    {helpdeskSaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Configuration
                  </Button>
                  {helpdeskIntegration?.enabled && (
                    <Button
                      variant="outline"
                      onClick={testHelpdeskConnection}
                      disabled={testingHelpdesk}
                      data-testid="button-test-helpdesk"
                    >
                      {testingHelpdesk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Test Connection
                    </Button>
                  )}
                </div>

                {helpdeskTestStatus && (
                  <Alert variant={helpdeskTestStatus.success ? "default" : "destructive"}>
                    {helpdeskTestStatus.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertTitle>{helpdeskTestStatus.success ? "Connection Successful" : "Connection Failed"}</AlertTitle>
                    <AlertDescription>{helpdeskTestStatus.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {helpdeskIntegration?.enabled && (
            <Card>
              <CardHeader>
                <CardTitle>Sync Articles</CardTitle>
                <CardDescription>Import articles from or export articles to your helpdesk</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <Button
                    onClick={() => helpdeskImportMutation.mutate()}
                    disabled={helpdeskImportMutation.isPending}
                    data-testid="button-import-helpdesk"
                  >
                    {helpdeskImportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Import from {helpdeskProvider === "zendesk" ? "Zendesk" : "Freshdesk"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => helpdeskExportMutation.mutate()}
                    disabled={helpdeskExportMutation.isPending}
                    data-testid="button-export-helpdesk"
                  >
                    {helpdeskExportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                    Export to {helpdeskProvider === "zendesk" ? "Zendesk" : "Freshdesk"}
                  </Button>
                </div>

                {remoteCategories && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Default {helpdeskProvider === "zendesk" ? "Section" : "Folder"} for Export
                    </label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={helpdeskDefaultSection}
                      onChange={(e) => setHelpdeskDefaultSection(e.target.value)}
                      data-testid="select-helpdesk-section"
                    >
                      <option value="">Select a {helpdeskProvider === "zendesk" ? "section" : "folder"}...</option>
                      {helpdeskProvider === "zendesk" && remoteCategories.sections?.map((section) => (
                        <option key={section.id} value={String(section.id)}>
                          {section.name}
                        </option>
                      ))}
                      {helpdeskProvider === "freshdesk" && remoteCategories.folders?.map((folder) => (
                        <option key={folder.id} value={String(folder.id)}>
                          {folder.name} ({folder.categoryName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {helpdeskIntegration?.enabled && (
            <Card>
              <CardHeader>
                <CardTitle>Sync History</CardTitle>
                <CardDescription>Recent synchronization jobs</CardDescription>
              </CardHeader>
              <CardContent>
                {syncJobsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : syncJobs && syncJobs.length > 0 ? (
                  <div className="space-y-3">
                    {syncJobs.slice(0, 10).map((job) => (
                      <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-md" data-testid={`sync-job-${job.id}`}>
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}
                          >
                            {job.status}
                          </Badge>
                          <span className="text-sm font-medium capitalize">{job.direction}</span>
                          <span className="text-sm text-muted-foreground">
                            {new Date(job.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Created: {job.createdItems}</span>
                          <span>Updated: {job.updatedItems}</span>
                          {job.skippedItems > 0 && <span>Skipped: {job.skippedItems}</span>}
                          {job.failedItems > 0 && <span className="text-destructive">Failed: {job.failedItems}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No sync jobs yet</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Plug2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>Public API</CardTitle>
                  <CardDescription>Create API keys to access your knowledge base programmatically</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* New API Key Creation */}
              <div className="space-y-4">
                <h3 className="font-semibold">Create New API Key</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Key name (e.g., Production, Development)"
                    value={newApiKeyName}
                    onChange={(e) => setNewApiKeyName(e.target.value)}
                    className="flex-1"
                    data-testid="input-api-key-name"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newApiKeyScopes.includes("read")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewApiKeyScopes(prev => [...prev, "read"]);
                          } else {
                            setNewApiKeyScopes(prev => prev.filter(s => s !== "read"));
                          }
                        }}
                        className="rounded"
                        data-testid="checkbox-scope-read"
                      />
                      Read
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newApiKeyScopes.includes("write")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewApiKeyScopes(["read", "write"]);
                          } else {
                            setNewApiKeyScopes(["read"]);
                          }
                        }}
                        className="rounded"
                        data-testid="checkbox-scope-write"
                      />
                      Write
                    </label>
                  </div>
                  <Button
                    onClick={() => {
                      if (newApiKeyName.trim()) {
                        createApiKeyMutation.mutate({
                          name: newApiKeyName.trim(),
                          scopes: newApiKeyScopes,
                        });
                      }
                    }}
                    disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending}
                    data-testid="button-create-api-key"
                  >
                    {createApiKeyMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4 mr-2" />
                        Create Key
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Newly Created Key Alert */}
              {newlyCreatedKey && (
                <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                  <Key className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertTitle className="text-green-800 dark:text-green-300">Your New API Key</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p className="text-green-700 dark:text-green-400">
                      Copy this key now - you won't be able to see it again!
                    </p>
                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded border font-mono text-sm">
                      <code className="flex-1 break-all" data-testid="text-new-api-key">{newlyCreatedKey}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(newlyCreatedKey, "new")}
                        data-testid="button-copy-new-key"
                      >
                        {copiedKeyId === "new" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewlyCreatedKey(null)}
                      className="mt-2"
                    >
                      Dismiss
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* API Keys List */}
              <div className="space-y-4">
                <h3 className="font-semibold">Your API Keys</h3>
                {apiKeysLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys && apiKeys.length > 0 ? (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg"
                        data-testid={`api-key-row-${key.id}`}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`text-key-name-${key.id}`}>{key.name}</span>
                            <Badge variant="outline" className="text-xs font-mono">
                              {key.prefix}...
                            </Badge>
                            {key.scopes.includes("write") && (
                              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                Write
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Created {new Date(key.createdAt).toLocaleDateString()} 
                            {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                            {` • ${key.requestCount.toLocaleString()} requests`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => regenerateApiKeyMutation.mutate(key.id)}
                            disabled={regenerateApiKeyMutation.isPending}
                            data-testid={`button-regenerate-${key.id}`}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Regenerate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            onClick={() => {
                              if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
                                revokeApiKeyMutation.mutate(key.id);
                              }
                            }}
                            disabled={revokeApiKeyMutation.isPending}
                            data-testid={`button-revoke-${key.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No API keys yet</p>
                    <p className="text-sm">Create your first API key to start using the public API</p>
                  </div>
                )}
              </div>

              {/* API Documentation */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">API Documentation</h3>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Base URL</AlertTitle>
                  <AlertDescription>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {window.location.origin}/api/v1
                    </code>
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GET</Badge>
                      <code className="text-sm">/articles</code>
                    </div>
                    <p className="text-sm text-muted-foreground">List all articles. Supports ?category_id, ?is_public, ?limit, ?offset</p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GET</Badge>
                      <code className="text-sm">/articles/:id</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Get a specific article by ID</p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GET</Badge>
                      <code className="text-sm">/categories</code>
                    </div>
                    <p className="text-sm text-muted-foreground">List all categories</p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GET</Badge>
                      <code className="text-sm">/search?q=query</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Search articles. Supports ?q (required), ?is_public, ?limit</p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GET</Badge>
                      <code className="text-sm">/knowledge-base</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Get knowledge base info (title, slug, primary color)</p>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Authentication</AlertTitle>
                  <AlertDescription>
                    Include your API key in the Authorization header:
                    <code className="block mt-2 p-2 bg-muted rounded text-sm">
                      Authorization: Bearer kb_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxx
                    </code>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

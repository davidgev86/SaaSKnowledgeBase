import { useState } from "react";
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
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="servicenow" className="gap-2" data-testid="tab-servicenow">
            <Workflow className="w-4 h-4" />
            <span className="hidden sm:inline">ServiceNow</span>
          </TabsTrigger>
          <TabsTrigger value="slack" className="gap-2" data-testid="tab-slack">
            <MessagesSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Slack</span>
          </TabsTrigger>
          <TabsTrigger value="sso" className="gap-2" data-testid="tab-sso">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">SSO</span>
          </TabsTrigger>
          <TabsTrigger value="zendesk" className="gap-2" data-testid="tab-zendesk" disabled>
            <Headphones className="w-4 h-4" />
            <span className="hidden sm:inline">Zendesk</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2" data-testid="tab-api" disabled>
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

        <TabsContent value="zendesk">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                  <Headphones className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <CardTitle>Zendesk / Freshdesk</CardTitle>
                  <CardDescription>Import and export articles to support platforms</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Plug2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>Public API</CardTitle>
                  <CardDescription>API keys and documentation for external access</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
  Headphones
} from "lucide-react";
import { z } from "zod";
import type { Integration } from "@shared/schema";

const serviceNowFormSchema = z.object({
  instanceUrl: z.string().url("Please enter a valid URL").or(z.literal("")),
  incidentFormEnabled: z.boolean(),
  autoSync: z.boolean(),
});

type ServiceNowFormValues = z.infer<typeof serviceNowFormSchema>;

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
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="servicenow" className="gap-2" data-testid="tab-servicenow">
            <Workflow className="w-4 h-4" />
            <span className="hidden sm:inline">ServiceNow</span>
          </TabsTrigger>
          <TabsTrigger value="slack" className="gap-2" data-testid="tab-slack" disabled>
            <MessagesSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Slack</span>
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

        <TabsContent value="slack">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <MessagesSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle>Slack</CardTitle>
                  <CardDescription>Search articles from Slack with slash commands</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Coming soon...</p>
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

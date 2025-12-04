import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Upload } from "lucide-react";
import { useKnowledgeBase } from "@/context/KnowledgeBaseContext";
import type { UploadResult } from "@uppy/core";
import type { KnowledgeBase } from "@shared/schema";
import { insertKnowledgeBaseSchema } from "@shared/schema";
import { z } from "zod";

const settingsFormSchema = insertKnowledgeBaseSchema.extend({
  siteTitle: z.string().min(1, "Site title is required"),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
}).omit({ userId: true });

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedKnowledgeBase, getApiUrl, refreshKnowledgeBases, isLoading: isKbLoading, isReady } = useKnowledgeBase();

  const kb = selectedKnowledgeBase;
  const isLoading = !kb || isKbLoading || !isReady;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      siteTitle: "Knowledge Base",
      primaryColor: "#3B82F6",
      logoUrl: null,
      customDomain: null,
    },
  });

  useEffect(() => {
    if (kb) {
      form.reset({
        siteTitle: kb.siteTitle,
        primaryColor: kb.primaryColor || "#3B82F6",
        logoUrl: kb.logoUrl || null,
        customDomain: kb.customDomain || null,
      });
    }
  }, [kb, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      if (kb) {
        await apiRequest("PUT", getApiUrl(`/api/knowledge-bases/${kb.id}`), data);
      } else {
        await apiRequest("POST", getApiUrl("/api/knowledge-bases"), data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      refreshKnowledgeBases();
      toast({
        title: "Success",
        description: "Settings saved successfully",
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
        description: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormValues) => {
    const normalizedData = {
      ...data,
      primaryColor: data.primaryColor?.toUpperCase() || "#3B82F6",
    };
    saveMutation.mutate(normalizedData);
  };

  const handleLogoUpload = async () => {
    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });
      const { uploadURL } = await response.json();
      return { method: "PUT" as const, url: uploadURL };
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get upload URL",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleLogoComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    const uploadedFile = result.successful?.[0];
    if (!uploadedFile) return;

    try {
      const response = await apiRequest("PUT", "/api/logos", {
        logoURL: uploadedFile.uploadURL,
      });
      const responseData = await response.json();
      const logoPath = responseData.objectPath;
      form.setValue("logoUrl", logoPath);
      
      // Auto-save the settings with the new logo
      if (kb) {
        const currentValues = form.getValues();
        await apiRequest("PUT", getApiUrl(`/api/knowledge-bases/${kb.id}`), {
          ...currentValues,
          logoUrl: logoPath,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
        refreshKnowledgeBases();
      }
      
      toast({
        title: "Success",
        description: "Logo uploaded and saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save logo",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Customize your knowledge base branding</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Configure your knowledge base details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="siteTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Title</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="My Knowledge Base"
                          data-testid="input-site-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="primaryColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Color</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={field.value || "#3B82F6"}
                            onChange={field.onChange}
                            className="w-20 h-10 cursor-pointer"
                            data-testid="input-primary-color"
                          />
                          <Input
                            type="text"
                            value={field.value || "#3B82F6"}
                            onChange={field.onChange}
                            className="flex-1"
                            data-testid="input-primary-color-text"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          {field.value && (
                            <img
                              src={field.value}
                              alt="Logo"
                              className="w-16 h-16 object-contain border rounded"
                              data-testid="img-current-logo"
                            />
                          )}
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={5242880}
                            onGetUploadParameters={handleLogoUpload}
                            onComplete={handleLogoComplete}
                            buttonClassName="data-[testid]:button-upload-logo"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {field.value ? "Change Logo" : "Upload Logo"}
                          </ObjectUploader>
                        </div>
                      </FormControl>
                      <FormDescription>Upload a logo for your knowledge base</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={saveMutation.isPending || isLoading}
                  data-testid="button-save-settings"
                >
                  {saveMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Public URL</CardTitle>
                <CardDescription>Share your knowledge base with others</CardDescription>
              </CardHeader>
              <CardContent>
                {kb ? (
                  <div className="space-y-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/kb/${kb.slug}`}
                      data-testid="input-public-url"
                    />
                    <Button variant="outline" asChild data-testid="button-view-public">
                      <a href={`/kb/${kb.slug}`} target="_blank" rel="noopener noreferrer">
                        View Public Site
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Save your settings to generate a public URL</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>How your knowledge base will look</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="border rounded-md p-6"
                  style={{ borderColor: form.watch("primaryColor") || "#3B82F6" }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {form.watch("logoUrl") && (
                      <img
                        src={form.watch("logoUrl") || ""}
                        alt="Logo"
                        className="w-12 h-12 object-contain"
                      />
                    )}
                    <h2 className="text-2xl font-bold">{form.watch("siteTitle")}</h2>
                  </div>
                  <div className="h-12 rounded" style={{ backgroundColor: (form.watch("primaryColor") || "#3B82F6") + "20" }}>
                    <div
                      className="h-full w-1/3 rounded flex items-center justify-center text-sm font-medium text-white"
                      style={{ backgroundColor: form.watch("primaryColor") || "#3B82F6" }}
                    >
                      Sample Button
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>
    </div>
  );
}

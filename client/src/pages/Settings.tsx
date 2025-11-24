import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Upload } from "lucide-react";
import type { UploadResult } from "@uppy/core";
import type { KnowledgeBase } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [siteTitle, setSiteTitle] = useState("Knowledge Base");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [logoUrl, setLogoUrl] = useState("");

  const { data: knowledgeBases } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-bases"],
  });

  const kb = knowledgeBases?.[0];

  useEffect(() => {
    if (kb) {
      setSiteTitle(kb.siteTitle);
      setPrimaryColor(kb.primaryColor || "#3B82F6");
      setLogoUrl(kb.logoUrl || "");
    }
  }, [kb]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        siteTitle,
        primaryColor,
        logoUrl: logoUrl || null,
      };

      if (kb) {
        await apiRequest("PUT", `/api/knowledge-bases/${kb.id}`, data);
      } else {
        await apiRequest("POST", "/api/knowledge-bases", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
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
    const uploadedFile = result.successful[0];
    if (!uploadedFile) return;

    try {
      const response = await apiRequest("PUT", "/api/logos", {
        logoURL: uploadedFile.uploadURL,
      });
      setLogoUrl(response.objectPath);
      toast({
        title: "Success",
        description: "Logo uploaded successfully",
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

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure your knowledge base details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="siteTitle">Site Title</Label>
                <Input
                  id="siteTitle"
                  value={siteTitle}
                  onChange={(e) => setSiteTitle(e.target.value)}
                  placeholder="My Knowledge Base"
                  data-testid="input-site-title"
                />
              </div>

              <div>
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="input-primary-color"
                  />
                  <Input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                    data-testid="input-primary-color-text"
                  />
                </div>
              </div>

              <div>
                <Label>Logo</Label>
                <div className="flex items-center gap-4 mt-2">
                  {logoUrl && (
                    <img
                      src={logoUrl}
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
                    {logoUrl ? "Change Logo" : "Upload Logo"}
                  </ObjectUploader>
                </div>
              </div>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
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
                    value={`${window.location.origin}/kb/${user?.id}`}
                    data-testid="input-public-url"
                  />
                  <Button variant="outline" asChild data-testid="button-view-public">
                    <a href={`/kb/${user?.id}`} target="_blank" rel="noopener noreferrer">
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
                style={{ borderColor: primaryColor }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-12 h-12 object-contain"
                    />
                  )}
                  <h2 className="text-2xl font-bold">{siteTitle}</h2>
                </div>
                <div className="h-12 rounded" style={{ backgroundColor: primaryColor + "20" }}>
                  <div
                    className="h-full w-1/3 rounded flex items-center justify-center text-sm font-medium text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Sample Button
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

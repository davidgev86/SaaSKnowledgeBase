import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Undo, Redo, History, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import type { Article, Category, ArticleRevision } from "@shared/schema";
import { insertArticleSchema } from "@shared/schema";
import { z } from "zod";

const articleFormSchema = insertArticleSchema.extend({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Article content is required"),
}).omit({ knowledgeBaseId: true });

type ArticleFormValues = z.infer<typeof articleFormSchema>;

export default function ArticleEditor() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const articleId = params.id;
  const isEditing = articleId && articleId !== "new";
  const contentFieldOnChangeRef = useRef<((value: string) => void) | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<ArticleRevision | null>(null);

  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: {
      title: "",
      categoryId: null,
      isPublic: false,
      content: "",
    },
  });

  const { data: article } = useQuery<Article>({
    queryKey: ["/api/articles", articleId],
    enabled: !!isEditing,
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: revisions, isLoading: revisionsLoading } = useQuery<ArticleRevision[]>({
    queryKey: ["/api/articles", articleId, "revisions"],
    enabled: !!isEditing,
  });

  const restoreMutation = useMutation({
    mutationFn: async (version: number) => {
      await apiRequest("POST", `/api/articles/${articleId}/restore/${version}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles", articleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles", articleId, "revisions"] });
      setRestoreDialogOpen(false);
      setSelectedRevision(null);
      toast({
        title: "Success",
        description: "Article restored to previous version",
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
        description: "Failed to restore article",
        variant: "destructive",
      });
    },
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg mx-auto focus:outline-none min-h-[400px] p-8",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      form.setValue("content", html, { shouldValidate: true });
      if (contentFieldOnChangeRef.current) {
        contentFieldOnChangeRef.current(html);
      }
    },
  });

  useEffect(() => {
    if (article && editor) {
      form.reset({
        title: article.title,
        categoryId: article.categoryId,
        isPublic: article.isPublic,
        content: article.content,
      });
      editor.commands.setContent(article.content);
    }
  }, [article, editor, form]);

  const saveMutation = useMutation({
    mutationFn: async (formData: ArticleFormValues) => {
      if (isEditing) {
        await apiRequest("PUT", `/api/articles/${articleId}`, formData);
      } else {
        await apiRequest("POST", "/api/articles", formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({
        title: "Success",
        description: `Article ${isEditing ? "updated" : "created"} successfully`,
      });
      navigate("/articles");
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
        description: `Failed to ${isEditing ? "update" : "create"} article`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ArticleFormValues) => {
    const normalizedData = {
      ...data,
      categoryId: data.categoryId || null,
    };
    saveMutation.mutate(normalizedData);
  };

  if (!editor) {
    return null;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="min-h-screen bg-background">
        <div className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">{isEditing ? "Edit Article" : "New Article"}</h1>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/articles")} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? "Saving..." : "Save Article"}
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            <div>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-base">Article Title</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter article title..."
                        className="text-lg h-12"
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <Card className="p-2 mb-4">
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant={editor.isActive("bold") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  data-testid="button-bold"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive("italic") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  data-testid="button-italic"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  data-testid="button-h1"
                >
                  <Heading1 className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  data-testid="button-h2"
                >
                  <Heading2 className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  data-testid="button-bullet-list"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  data-testid="button-ordered-list"
                >
                  <ListOrdered className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  data-testid="button-undo"
                >
                  <Undo className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  data-testid="button-redo"
                >
                  <Redo className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            <Controller
              control={form.control}
              name="content"
              render={({ field, fieldState }) => {
                contentFieldOnChangeRef.current = field.onChange;
                return (
                  <FormItem>
                    <FormControl>
                      <Card className="overflow-hidden">
                        <EditorContent editor={editor} data-testid="editor-content" />
                      </Card>
                    </FormControl>
                    {fieldState.error && (
                      <p className="text-sm font-medium text-destructive">
                        {fieldState.error.message}
                      </p>
                    )}
                  </FormItem>
                );
              }}
            />
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Article Settings</h3>
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value || "uncategorized"}
                        onValueChange={(value) => field.onChange(value === "uncategorized" ? null : value)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="uncategorized">Uncategorized</SelectItem>
                          {categories?.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="cursor-pointer">Make Public</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-public"
                          />
                        </FormControl>
                      </div>
                      <FormDescription>
                        Public articles appear in your knowledge base
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("isPublic") && (
                  <p className="text-xs text-muted-foreground">
                    This article will be visible on your public knowledge base
                  </p>
                )}
              </div>
            </Card>

            {isEditing && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Version History
                  </CardTitle>
                  <CardDescription>
                    Previous versions of this article
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {revisionsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : revisions && revisions.length > 0 ? (
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {revisions.map((revision) => (
                          <div
                            key={revision.id}
                            className="flex items-center justify-between p-2 rounded-md border bg-muted/30"
                            data-testid={`revision-${revision.version}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                Version {revision.version}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {revision.createdAt
                                  ? format(new Date(revision.createdAt), "MMM d, yyyy h:mm a")
                                  : "Unknown date"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRevision(revision);
                                setRestoreDialogOpen(true);
                              }}
                              data-testid={`button-restore-${revision.version}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No previous versions yet. Versions are created when you save changes.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version {selectedRevision?.version}?</DialogTitle>
            <DialogDescription>
              This will restore the article to version {selectedRevision?.version} from{" "}
              {selectedRevision?.createdAt
                ? format(new Date(selectedRevision.createdAt), "MMM d, yyyy h:mm a")
                : "unknown date"}.
              A new version will be saved with your current content before restoring.
            </DialogDescription>
          </DialogHeader>
          {selectedRevision && (
            <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
              <p className="text-sm font-medium mb-2">{selectedRevision.title}</p>
              <div
                className="text-xs text-muted-foreground prose prose-sm"
                dangerouslySetInnerHTML={{ __html: selectedRevision.content.substring(0, 500) + (selectedRevision.content.length > 500 ? "..." : "") }}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
              data-testid="button-cancel-restore"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => selectedRevision && restoreMutation.mutate(selectedRevision.version)}
              disabled={restoreMutation.isPending}
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </form>
    </Form>
  );
}

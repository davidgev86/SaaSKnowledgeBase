import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Undo, Redo } from "lucide-react";
import type { Article, Category } from "@shared/schema";

export default function ArticleEditor() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const articleId = params.id;
  const isEditing = articleId && articleId !== "new";

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);

  const { data: article } = useQuery<Article>({
    queryKey: ["/api/articles", articleId],
    enabled: !!isEditing,
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg mx-auto focus:outline-none min-h-[400px] p-8",
      },
    },
  });

  useEffect(() => {
    if (article && editor) {
      setTitle(article.title);
      setCategoryId(article.categoryId || "");
      setIsPublic(article.isPublic);
      editor.commands.setContent(article.content);
    }
  }, [article, editor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const content = editor?.getHTML() || "";
      const data = {
        title,
        content,
        categoryId: categoryId || null,
        isPublic,
      };

      if (isEditing) {
        await apiRequest("PUT", `/api/articles/${articleId}`, data);
      } else {
        await apiRequest("POST", "/api/articles", data);
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

  if (!editor) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{isEditing ? "Edit Article" : "New Article"}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/articles")} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!title || saveMutation.isPending}
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
            <div className="mb-6">
              <Label htmlFor="title" className="text-base mb-2">Article Title</Label>
              <Input
                id="title"
                type="text"
                placeholder="Enter article title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg h-12"
                data-testid="input-title"
              />
            </div>

            <Card className="p-2 mb-4">
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={editor.isActive("bold") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  data-testid="button-bold"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  variant={editor.isActive("italic") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  data-testid="button-italic"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  data-testid="button-h1"
                >
                  <Heading1 className="w-4 h-4" />
                </Button>
                <Button
                  variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  data-testid="button-h2"
                >
                  <Heading2 className="w-4 h-4" />
                </Button>
                <Button
                  variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  data-testid="button-bullet-list"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  data-testid="button-ordered-list"
                >
                  <ListOrdered className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  data-testid="button-undo"
                >
                  <Undo className="w-4 h-4" />
                </Button>
                <Button
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

            <Card className="overflow-hidden">
              <EditorContent editor={editor} data-testid="editor-content" />
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Article Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="category" className="mb-2">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="category" data-testid="select-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Uncategorized</SelectItem>
                      {categories?.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="public" className="cursor-pointer">
                    Make Public
                  </Label>
                  <Switch
                    id="public"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    data-testid="switch-public"
                  />
                </div>

                {isPublic && (
                  <p className="text-xs text-muted-foreground">
                    This article will be visible on your public knowledge base
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

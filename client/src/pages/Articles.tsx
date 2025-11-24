import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { ArticleListSkeleton } from "@/components/LoadingSkeleton";
import { Link } from "wouter";
import { FileText, Plus, Search, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import type { Article, Category } from "@shared/schema";

export default function Articles() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/articles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({
        title: "Success",
        description: "Article deleted successfully",
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
        description: "Failed to delete article",
        variant: "destructive",
      });
    },
  });

  const filteredArticles = articles?.filter((article) =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    return categories?.find((c) => c.id === categoryId)?.name || "Unknown";
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <ArticleListSkeleton />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Articles</h1>
          <p className="text-muted-foreground">Manage your knowledge base content</p>
        </div>
        <Button asChild data-testid="button-create-article">
          <Link href="/articles/new">
            <Plus className="w-4 h-4 mr-2" />
            New Article
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </div>

      {!filteredArticles || filteredArticles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={searchQuery ? "No articles found" : "No articles yet"}
          description={searchQuery ? "Try a different search term" : "Create your first article to get started"}
          actionLabel={searchQuery ? undefined : "Create Article"}
          onAction={searchQuery ? undefined : () => window.location.href = "/articles/new"}
        />
      ) : (
        <div className="space-y-4">
          {filteredArticles.map((article) => (
            <Card key={article.id} className="p-6 hover-elevate" data-testid={`article-card-${article.id}`}>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 mb-2">
                    <h3 className="text-lg font-semibold truncate" data-testid={`text-article-title-${article.id}`}>{article.title}</h3>
                    {article.isPublic ? (
                      <Badge variant="secondary" className="shrink-0" data-testid={`badge-public-${article.id}`}>
                        <Eye className="w-3 h-3 mr-1" />
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0" data-testid={`badge-private-${article.id}`}>
                        <EyeOff className="w-3 h-3 mr-1" />
                        Private
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" data-testid={`badge-category-${article.id}`}>{getCategoryName(article.categoryId)}</Badge>
                    <span>•</span>
                    <span data-testid={`text-updated-${article.id}`}>Updated {new Date(article.updatedAt!).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" asChild data-testid={`button-edit-article-${article.id}`}>
                    <Link href={`/articles/${article.id}/edit`}>
                      <Edit className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(article.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-article-${article.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, FileText } from "lucide-react";
import { SimpleThemeToggle } from "@/components/ThemeToggle";
import type { KnowledgeBase, Article, Category } from "@shared/schema";

export default function PublicKnowledgeBase() {
  const params = useParams();
  const userId = params.userId;
  const [searchQuery, setSearchQuery] = useState("");

  const { data: kb } = useQuery<KnowledgeBase>({
    queryKey: [`/api/kb/${userId}`],
  });

  const { data: articles } = useQuery<Article[]>({
    queryKey: [`/api/kb/${userId}/articles`],
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: [`/api/kb/${userId}/categories`],
  });

  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      await fetch(`/api/kb/${userId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
      window.location.href = `/kb/${userId}/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  const getCategoryArticles = (categoryId: string) => {
    return articles?.filter((a) => a.categoryId === categoryId && a.isPublic) || [];
  };

  const uncategorizedArticles = articles?.filter((a) => !a.categoryId && a.isPublic) || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              {kb?.logoUrl && (
                <img
                  src={kb.logoUrl}
                  alt="Logo"
                  className="h-10 w-10 object-contain"
                  data-testid="img-kb-logo"
                />
              )}
              <h1 className="text-2xl font-bold">{kb?.siteTitle || "Knowledge Base"}</h1>
            </div>
            <SimpleThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <section
          className="py-24 px-4"
          style={{
            background: kb?.primaryColor
              ? `linear-gradient(to bottom, ${kb.primaryColor}10, transparent)`
              : undefined,
          }}
        >
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-4">How can we help you?</h2>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search for articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg"
                data-testid="input-public-search"
              />
            </form>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold mb-8">Browse by Category</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories?.map((category) => {
              const categoryArticles = getCategoryArticles(category.id);
              if (categoryArticles.length === 0) return null;

              return (
                <Card key={category.id} className="p-6 hover-elevate" data-testid={`category-card-${category.id}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: kb?.primaryColor ? `${kb.primaryColor}20` : undefined }}
                    >
                      <BookOpen
                        className="w-5 h-5"
                        style={{ color: kb?.primaryColor }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
                      {category.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{category.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    {categoryArticles.slice(0, 3).map((article) => (
                      <Link key={article.id} href={`/kb/${userId}/articles/${article.id}`}>
                        <a className="block text-sm hover:text-primary transition-colors" data-testid={`article-link-${article.id}`}>
                          <FileText className="w-3 h-3 inline mr-2" />
                          {article.title}
                        </a>
                      </Link>
                    ))}
                    {categoryArticles.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{categoryArticles.length - 3} more</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {uncategorizedArticles.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6">More Articles</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uncategorizedArticles.map((article) => (
                  <Link key={article.id} href={`/kb/${userId}/articles/${article.id}`}>
                    <Card className="p-4 hover-elevate" data-testid={`uncategorized-article-${article.id}`}>
                      <h3 className="font-semibold mb-2">{article.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(article.updatedAt!).toLocaleDateString()}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {kb?.siteTitle || "Knowledge Base"}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

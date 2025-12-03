import { useState, useEffect } from "react";
import { useParams, useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, FileText } from "lucide-react";
import { SimpleThemeToggle } from "@/components/ThemeToggle";
import type { Article, KnowledgeBase } from "@shared/schema";

export default function PublicSearch() {
  const params = useParams();
  const searchParams = new URLSearchParams(useSearch());
  const userId = params.userId;
  const initialQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const { data: kb } = useQuery<KnowledgeBase>({
    queryKey: [`/api/kb/${userId}`],
  });

  const { data: articles } = useQuery<Article[]>({
    queryKey: [`/api/kb/${userId}/search`, searchQuery],
    enabled: !!searchQuery,
  });

  useEffect(() => {
    if (initialQuery && initialQuery !== searchQuery) {
      setSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/kb/${userId}/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

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
                />
              )}
              <Link href={`/kb/${userId}`}>
                <h1 className="text-2xl font-bold hover:text-primary cursor-pointer">
                  {kb?.siteTitle || "Knowledge Base"}
                </h1>
              </Link>
            </div>
            <SimpleThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <form onSubmit={handleSearch} className="mb-12">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search for articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg"
              data-testid="input-search-query"
            />
          </div>
        </form>

        <div className="mb-6">
          <h2 className="text-2xl font-bold">
            {searchQuery ? `Search Results for "${searchQuery}"` : "Search"}
          </h2>
          {articles && (
            <p className="text-muted-foreground mt-2" data-testid="search-results-count">
              {articles.length} {articles.length === 1 ? "result" : "results"} found
            </p>
          )}
        </div>

        {!searchQuery ? (
          <Card className="p-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
            <p className="text-sm text-muted-foreground">Enter a search term to find articles</p>
          </Card>
        ) : !articles || articles.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
            <p className="text-sm text-muted-foreground">
              Try searching with different keywords
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <Link key={article.id} href={`/kb/${userId}/articles/${article.id}`}>
                <Card className="p-6 hover-elevate" data-testid={`search-result-${article.id}`}>
                  <h3
                    className="text-lg font-semibold mb-2"
                    dangerouslySetInnerHTML={{
                      __html: highlightMatch(article.title, searchQuery),
                    }}
                  />
                  <div
                    className="text-sm text-muted-foreground line-clamp-2 prose prose-sm"
                    dangerouslySetInnerHTML={{
                      __html: highlightMatch(
                        article.content.replace(/<[^>]*>/g, "").substring(0, 200),
                        searchQuery
                      ),
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Updated {new Date(article.updatedAt!).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {kb?.siteTitle || "Knowledge Base"}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

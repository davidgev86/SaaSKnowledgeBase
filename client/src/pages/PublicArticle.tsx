import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, ChevronLeft } from "lucide-react";
import { SimpleThemeToggle } from "@/components/ThemeToggle";
import type { Article, KnowledgeBase } from "@shared/schema";

export default function PublicArticle() {
  const params = useParams();
  const userId = params.userId;
  const articleId = params.articleId;

  const { data: kb } = useQuery<KnowledgeBase>({
    queryKey: [`/api/kb/${userId}`],
  });

  const { data: article } = useQuery<Article>({
    queryKey: [`/api/kb/${userId}/articles/${articleId}`],
  });

  useEffect(() => {
    if (article) {
      fetch(`/api/analytics/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
    }
  }, [article]);

  const feedbackMutation = useMutation({
    mutationFn: async (isHelpful: boolean) => {
      await fetch(`/api/articles/${articleId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHelpful }),
      });
    },
  });

  if (!article) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Article not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href={`/kb/${userId}`}>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              {kb?.logoUrl && (
                <img
                  src={kb.logoUrl}
                  alt="Logo"
                  className="h-8 w-8 object-contain"
                />
              )}
              <span className="font-semibold">{kb?.siteTitle}</span>
              <SimpleThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <article>
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4" data-testid="article-title">{article.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Updated {new Date(article.updatedAt!).toLocaleDateString()}</span>
            </div>
          </div>

          <div
            className="prose prose-sm sm:prose lg:prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: article.content }}
            data-testid="article-content"
          />

          <div className="mt-16 pt-8 border-t">
            <Card className="p-8">
              <h3 className="text-lg font-semibold mb-4 text-center">Was this article helpful?</h3>
              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => feedbackMutation.mutate(true)}
                  disabled={feedbackMutation.isPending}
                  data-testid="button-helpful-yes"
                >
                  <ThumbsUp className="w-5 h-5 mr-2" />
                  Yes
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => feedbackMutation.mutate(false)}
                  disabled={feedbackMutation.isPending}
                  data-testid="button-helpful-no"
                >
                  <ThumbsDown className="w-5 h-5 mr-2" />
                  No
                </Button>
              </div>
              {feedbackMutation.isSuccess && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Thank you for your feedback!
                </p>
              )}
            </Card>
          </div>
        </article>
      </main>

      <footer className="border-t mt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {kb?.siteTitle || "Knowledge Base"}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, FolderOpen, Eye } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: kbData } = useQuery({
    queryKey: ["/api/knowledge-bases"],
  });

  const { data: articlesData } = useQuery({
    queryKey: ["/api/articles"],
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["/api/categories"],
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["/api/analytics/views"],
  });

  const kb = kbData?.[0];
  const totalArticles = articlesData?.length || 0;
  const totalCategories = categoriesData?.length || 0;
  const totalViews = analyticsData?.totalViews || 0;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome back{user?.firstName && `, ${user.firstName}`}!</h1>
          <p className="text-muted-foreground">Here's an overview of your knowledge base</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-articles">{totalArticles}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-categories">{totalCategories}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-views">{totalViews}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium" data-testid="kb-status">{kb ? "Active" : "Not Set Up"}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with your knowledge base</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button asChild data-testid="button-quick-new-article">
              <Link href="/articles/new">
                <FileText className="w-4 h-4 mr-2" />
                New Article
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-quick-categories">
              <Link href="/categories">
                <FolderOpen className="w-4 h-4 mr-2" />
                Manage Categories
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-quick-analytics">
              <Link href="/analytics">
                <Eye className="w-4 h-4 mr-2" />
                View Analytics
              </Link>
            </Button>
            {kb && (
              <Button variant="outline" asChild data-testid="button-quick-public-site">
                <a href={`/kb/${user?.id}`} target="_blank" rel="noopener noreferrer">
                  <BookOpen className="w-4 h-4 mr-2" />
                  View Public Site
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Search, TrendingUp } from "lucide-react";

interface AnalyticsData {
  totalViews: number;
  recentViews: Array<{ articleId: string; articleTitle: string; views: number }>;
  totalSearches: number;
  recentSearches: Array<{ query: string; count: number }>;
}

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/views"],
  });

  const { data: searchData } = useQuery({
    queryKey: ["/api/analytics/searches"],
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-muted-foreground">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics</h1>
        <p className="text-muted-foreground">Track your knowledge base performance</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-views">
              {analytics?.totalViews || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time article views</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-searches">
              {analytics?.totalSearches || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time searches</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-engagement">
              {analytics?.totalViews && analytics?.totalSearches
                ? ((analytics.totalViews + analytics.totalSearches) / 2).toFixed(0)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average activity</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Articles by Views</CardTitle>
            <CardDescription>Most viewed articles in your knowledge base</CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics?.recentViews || analytics.recentViews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No article views yet</p>
            ) : (
              <div className="space-y-3">
                {analytics.recentViews.slice(0, 5).map((item, index) => (
                  <div key={item.articleId} className="flex items-center justify-between" data-testid={`row-article-view-${index}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-article-title-view-${index}`}>{item.articleTitle}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold" data-testid={`text-view-count-${index}`}>{item.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Popular Search Queries</CardTitle>
            <CardDescription>What users are searching for</CardDescription>
          </CardHeader>
          <CardContent>
            {!searchData?.recentSearches || searchData.recentSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No search queries yet</p>
            ) : (
              <div className="space-y-3">
                {searchData.recentSearches.slice(0, 5).map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between" data-testid={`row-search-query-${index}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-search-query-${index}`}>{item.query}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold" data-testid={`text-search-count-${index}`}>{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

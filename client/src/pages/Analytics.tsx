import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, ResponsiveContainer } from "recharts";
import { Eye, Search, TrendingUp, Calendar } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, parse } from "date-fns";
import { useKnowledgeBase } from "@/context/KnowledgeBaseContext";

type DateRange = "7d" | "30d" | "90d" | "all";

interface ViewsByDate {
  date: string;
  views: number;
}

interface ArticleView {
  articleId: string;
  articleTitle: string;
  views: number;
}

interface SearchQuery {
  query: string;
  count: number;
}

interface AnalyticsViewsData {
  totalViews: number;
  recentViews: ArticleView[];
  viewsByDate: ViewsByDate[];
}

interface AnalyticsSearchData {
  totalSearches: number;
  recentSearches: SearchQuery[];
}

const chartConfig = {
  views: {
    label: "Views",
    color: "hsl(var(--primary))",
  },
  searches: {
    label: "Searches",
    color: "hsl(var(--primary))",
  },
};

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const { selectedKnowledgeBase, getApiUrl, isLoading: isKbLoading, isReady } = useKnowledgeBase();

  const dateParams = useMemo(() => {
    if (dateRange === "all") return {};
    
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    const startDate = startOfDay(subDays(new Date(), days));
    const endDate = endOfDay(new Date());
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [dateRange]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateParams.startDate) {
      params.append("startDate", dateParams.startDate);
      params.append("endDate", dateParams.endDate!);
    }
    if (selectedKnowledgeBase?.id) {
      params.append("kbId", selectedKnowledgeBase.id);
    }
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [dateParams, selectedKnowledgeBase?.id]);

  const { data: viewsData, isLoading: viewsLoading } = useQuery<AnalyticsViewsData>({
    queryKey: ["/api/analytics/views", dateRange, selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/views${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch views");
      return res.json();
    },
    enabled: !!selectedKnowledgeBase,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery<AnalyticsSearchData>({
    queryKey: ["/api/analytics/searches", dateRange, selectedKnowledgeBase?.id],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/searches${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch searches");
      return res.json();
    },
    enabled: !!selectedKnowledgeBase,
  });

  const chartData = useMemo(() => {
    if (!viewsData?.viewsByDate) return [];
    
    return viewsData.viewsByDate.map(item => ({
      date: format(parse(item.date, 'yyyy-MM-dd', new Date()), "MMM d"),
      views: item.views,
    }));
  }, [viewsData]);

  const searchChartData = useMemo(() => {
    if (!searchData?.recentSearches) return [];
    
    return searchData.recentSearches.slice(0, 8).map(item => ({
      query: item.query.length > 15 ? item.query.substring(0, 15) + "..." : item.query,
      fullQuery: item.query,
      count: item.count,
    }));
  }, [searchData]);

  const isLoading = viewsLoading || searchLoading || isKbLoading || !isReady;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-muted-foreground">Track your knowledge base performance</p>
        </div>
        
        <div className="flex items-center gap-2" data-testid="date-range-filter">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            {(["7d", "30d", "90d", "all"] as DateRange[]).map((range) => (
              <Button
                key={range}
                variant={dateRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setDateRange(range)}
                data-testid={`button-range-${range}`}
              >
                {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : range === "90d" ? "90 Days" : "All Time"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-views">
              {viewsData?.totalViews || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dateRange === "all" ? "All time" : `Last ${dateRange === "7d" ? "7 days" : dateRange === "30d" ? "30 days" : "90 days"}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-searches">
              {searchData?.totalSearches || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dateRange === "all" ? "All time" : `Last ${dateRange === "7d" ? "7 days" : dateRange === "30d" ? "30 days" : "90 days"}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Articles</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-top-articles">
              {viewsData?.recentViews?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Articles with views</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Views Over Time</CardTitle>
            <CardDescription>Daily article views for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {!chartData.length ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No view data available for this period
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="var(--color-views)"
                    strokeWidth={2}
                    dot={{ fill: "var(--color-views)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Search Queries</CardTitle>
            <CardDescription>What users are searching for</CardDescription>
          </CardHeader>
          <CardContent>
            {!searchChartData.length ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No search data available for this period
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={searchChartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis 
                    type="category" 
                    dataKey="query" 
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <p className="font-medium">{data.fullQuery}</p>
                            <p className="text-sm text-muted-foreground">{data.count} searches</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-searches)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
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
            {!viewsData?.recentViews || viewsData.recentViews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No article views yet</p>
            ) : (
              <div className="space-y-3">
                {viewsData.recentViews.slice(0, 10).map((item, index) => (
                  <div key={item.articleId} className="flex items-center justify-between" data-testid={`row-article-view-${index}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
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
            <CardDescription>Complete list of search terms</CardDescription>
          </CardHeader>
          <CardContent>
            {!searchData?.recentSearches || searchData.recentSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No search queries yet</p>
            ) : (
              <div className="space-y-3">
                {searchData.recentSearches.slice(0, 10).map((item, index) => (
                  <div key={index} className="flex items-center justify-between" data-testid={`row-search-query-${index}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
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

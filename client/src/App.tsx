import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Articles from "@/pages/Articles";
import ArticleEditor from "@/pages/ArticleEditor";
import Categories from "@/pages/Categories";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Team from "@/pages/Team";
import PublicKnowledgeBase from "@/pages/PublicKnowledgeBase";
import PublicArticle from "@/pages/PublicArticle";
import PublicSearch from "@/pages/PublicSearch";
import InviteAccept from "@/pages/InviteAccept";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/kb/:userId" component={PublicKnowledgeBase} />
        <Route path="/kb/:userId/articles/:articleId" component={PublicArticle} />
        <Route path="/kb/:userId/search" component={PublicSearch} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center gap-2 p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/articles" component={Articles} />
              <Route path="/articles/new" component={ArticleEditor} />
              <Route path="/articles/:id/edit" component={ArticleEditor} />
              <Route path="/categories" component={Categories} />
              <Route path="/team" component={Team} />
              <Route path="/settings" component={Settings} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/invite/:token" component={InviteAccept} />
              <Route path="/kb/:userId" component={PublicKnowledgeBase} />
              <Route path="/kb/:userId/articles/:articleId" component={PublicArticle} />
              <Route path="/kb/:userId/search" component={PublicSearch} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

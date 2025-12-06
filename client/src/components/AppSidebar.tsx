import { useState } from "react";
import { useLocation } from "wouter";
import { Home, FileText, FolderOpen, Settings, BarChart3, Users, LogOut, ChevronDown, Plus, BookOpen, Check, Plug2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKnowledgeBase } from "@/context/KnowledgeBaseContext";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Articles",
    url: "/articles",
    icon: FileText,
  },
  {
    title: "Categories",
    url: "/categories",
    icon: FolderOpen,
  },
  {
    title: "Team",
    url: "/team",
    icon: Users,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Plug2,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { knowledgeBases, selectedKnowledgeBase, selectKnowledgeBase, createKnowledgeBase, isCreating } = useKnowledgeBase();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKbTitle, setNewKbTitle] = useState("");

  const handleCreateKb = async () => {
    if (!newKbTitle.trim()) return;
    try {
      await createKnowledgeBase(newKbTitle);
      setNewKbTitle("");
      setIsCreateDialogOpen(false);
    } catch {
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 w-full p-2 rounded-md hover-elevate text-left"
              data-testid="kb-switcher-trigger"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedKnowledgeBase?.siteTitle || "Select KB"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedKnowledgeBase?.slug || "No knowledge base"}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {knowledgeBases.map((kb) => (
              <DropdownMenuItem
                key={kb.id}
                onClick={() => selectKnowledgeBase(kb.id)}
                data-testid={`kb-option-${kb.id}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{kb.siteTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">{kb.role}</p>
                  </div>
                  {selectedKnowledgeBase?.id === kb.id && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)} data-testid="create-new-kb">
              <Plus className="w-4 h-4 mr-2" />
              Create New KB
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`sidebar-${item.title.toLowerCase()}`}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-testid="sidebar-logout">
                  <a href="/api/logout">
                    <LogOut />
                    <span>Log Out</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kb-title">Site Title</Label>
              <Input
                id="kb-title"
                placeholder="My Knowledge Base"
                value={newKbTitle}
                onChange={(e) => setNewKbTitle(e.target.value)}
                data-testid="input-kb-title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKb} disabled={isCreating || !newKbTitle.trim()} data-testid="button-create-kb">
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}

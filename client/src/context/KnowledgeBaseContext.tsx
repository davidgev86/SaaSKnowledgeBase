import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { KnowledgeBase } from "@shared/schema";

interface KnowledgeBaseWithRole extends KnowledgeBase {
  role: "owner" | "admin" | "contributor" | "viewer";
}

interface KnowledgeBaseContextType {
  knowledgeBases: KnowledgeBaseWithRole[];
  selectedKnowledgeBase: KnowledgeBaseWithRole | null;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  selectKnowledgeBase: (kbId: string) => void;
  createKnowledgeBase: (siteTitle: string) => Promise<KnowledgeBase>;
  isCreating: boolean;
  getApiUrl: (path: string) => string;
  refreshKnowledgeBases: () => void;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextType | undefined>(undefined);

const SELECTED_KB_KEY = "selectedKnowledgeBaseId";

export function KnowledgeBaseProvider({ children }: { children: ReactNode }) {
  const [selectedKbId, setSelectedKbId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SELECTED_KB_KEY);
    }
    return null;
  });
  const autoCreateAttempted = useRef(false);

  const { data: knowledgeBases = [], isLoading, error, isFetched } = useQuery<KnowledgeBaseWithRole[]>({
    queryKey: ["/api/knowledge-bases"],
  });

  const createMutation = useMutation({
    mutationFn: async (siteTitle: string) => {
      const response = await apiRequest("POST", "/api/knowledge-bases", { siteTitle });
      return response.json();
    },
    onSuccess: (newKb: KnowledgeBase) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      setSelectedKbId(newKb.id);
      localStorage.setItem(SELECTED_KB_KEY, newKb.id);
    },
  });

  const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === selectedKbId) ?? knowledgeBases[0] ?? null;

  // Auto-create a default knowledge base for new users
  useEffect(() => {
    if (isFetched && knowledgeBases.length === 0 && !isLoading && !autoCreateAttempted.current && !createMutation.isPending) {
      autoCreateAttempted.current = true;
      createMutation.mutate("My Knowledge Base");
    }
  }, [isFetched, knowledgeBases.length, isLoading, createMutation]);

  useEffect(() => {
    if (knowledgeBases.length > 0 && !selectedKbId) {
      const firstKb = knowledgeBases[0];
      setSelectedKbId(firstKb.id);
      localStorage.setItem(SELECTED_KB_KEY, firstKb.id);
    }
  }, [knowledgeBases, selectedKbId]);

  useEffect(() => {
    if (selectedKnowledgeBase && selectedKbId !== selectedKnowledgeBase.id) {
      setSelectedKbId(selectedKnowledgeBase.id);
      localStorage.setItem(SELECTED_KB_KEY, selectedKnowledgeBase.id);
    }
  }, [selectedKnowledgeBase, selectedKbId]);

  // isReady is true when we have a selected KB (either from existing list or newly created)
  const isReady = selectedKnowledgeBase !== null;

  const selectKnowledgeBase = (kbId: string) => {
    setSelectedKbId(kbId);
    localStorage.setItem(SELECTED_KB_KEY, kbId);
    queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
  };

  const getApiUrl = (path: string): string => {
    if (!selectedKnowledgeBase) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}kbId=${selectedKnowledgeBase.id}`;
  };

  const refreshKnowledgeBases = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
  };

  // Show loading while fetching KBs or auto-creating for new users
  const effectiveIsLoading = isLoading || createMutation.isPending;

  return (
    <KnowledgeBaseContext.Provider
      value={{
        knowledgeBases,
        selectedKnowledgeBase,
        isLoading: effectiveIsLoading,
        isReady,
        error: error as Error | null,
        selectKnowledgeBase,
        createKnowledgeBase: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
        getApiUrl,
        refreshKnowledgeBases,
      }}
    >
      {children}
    </KnowledgeBaseContext.Provider>
  );
}

export function useKnowledgeBase() {
  const context = useContext(KnowledgeBaseContext);
  if (context === undefined) {
    throw new Error("useKnowledgeBase must be used within a KnowledgeBaseProvider");
  }
  return context;
}

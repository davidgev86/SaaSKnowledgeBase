import { Skeleton } from "@/components/ui/skeleton";

export function ArticleListSkeleton() {
  return (
    <div className="space-y-4" data-testid="loading-skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-6 border rounded-md">
          <Skeleton className="h-6 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="p-6 border rounded-md" data-testid="stat-skeleton">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

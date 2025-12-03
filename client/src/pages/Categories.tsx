import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { Plus, FolderOpen, Edit, Trash2, GripVertical } from "lucide-react";
import type { Category } from "@shared/schema";
import { insertCategorySchema } from "@shared/schema";
import { z } from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const categoryFormSchema = insertCategorySchema.extend({
  name: z.string().min(1, "Category name is required"),
}).omit({ knowledgeBaseId: true, order: true });

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

interface SortableCategoryCardProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function SortableCategoryCard({ category, onEdit, onDelete, isDeleting }: SortableCategoryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="p-4 flex items-center gap-4"
      data-testid={`category-card-${category.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover-elevate rounded"
        data-testid={`drag-handle-${category.id}`}
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </div>
      
      <FolderOpen className="w-6 h-6 text-primary flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate" data-testid={`text-category-name-${category.id}`}>
          {category.name}
        </h3>
        {category.description && (
          <p className="text-sm text-muted-foreground truncate" data-testid={`text-category-desc-${category.id}`}>
            {category.description}
          </p>
        )}
      </div>
      
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(category)}
          data-testid={`button-edit-category-${category.id}`}
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(category.id)}
          disabled={isDeleting}
          data-testid={`button-delete-category-${category.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

export default function Categories() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      if (editingCategory) {
        await apiRequest("PUT", `/api/categories/${editingCategory.id}`, data);
      } else {
        await apiRequest("POST", "/api/categories", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Success",
        description: `Category ${editingCategory ? "updated" : "created"} successfully`,
      });
      resetForm();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: `Failed to ${editingCategory ? "update" : "create"} category`,
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (categoryOrders: { id: string; order: number }[]) => {
      await apiRequest("PUT", "/api/categories/reorder", { categoryOrders });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to reorder categories",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
  });

  const onSubmit = (data: CategoryFormValues) => {
    saveMutation.mutate(data);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    form.reset({
      name: "",
      description: "",
    });
    setEditingCategory(null);
    setIsDialogOpen(false);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      description: category.description || "",
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && categories) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(categories, oldIndex, newIndex);
        const categoryOrders = reordered.map((cat, index) => ({
          id: cat.id,
          order: index,
        }));

        queryClient.setQueryData(["/api/categories"], reordered);
        reorderMutation.mutate(categoryOrders);
      }
    }
  };

  if (isLoading) {
    return <div className="p-8 max-w-5xl mx-auto">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Categories</h1>
          <p className="text-muted-foreground">
            Organize your articles into categories. Drag to reorder.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} data-testid="button-create-category">
              <Plus className="w-4 h-4 mr-2" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-category">
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Edit Category" : "Create Category"}</DialogTitle>
              <DialogDescription>
                {editingCategory ? "Update category details" : "Add a new category for your articles"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Getting Started"
                          data-testid="input-category-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Articles to help you get started..."
                          data-testid="textarea-category-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm} data-testid="button-cancel-category">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    data-testid="button-save-category"
                  >
                    {saveMutation.isPending ? "Saving..." : editingCategory ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!categories || categories.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No categories yet"
          description="Create categories to organize your articles"
          actionLabel="Create Category"
          onAction={openCreateDialog}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3" data-testid="categories-list">
              {categories.map((category) => (
                <SortableCategoryCard
                  key={category.id}
                  category={category}
                  onEdit={openEditDialog}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {categories && categories.length > 0 && (
        <p className="text-sm text-muted-foreground mt-6 text-center">
          The order shown here is how categories will appear on your public knowledge base.
        </p>
      )}
    </div>
  );
}

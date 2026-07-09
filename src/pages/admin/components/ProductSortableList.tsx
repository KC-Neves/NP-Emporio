import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/hooks/useProducts";

interface ProductSortableListProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onToggleFeatured: (id: number, currentFeatured: boolean) => void;
  onToggleActive: (id: number, currentActive: boolean) => void;
  refreshProducts: () => void;
  addToast?: (message: string, type?: "success" | "error" | "warning" | "info") => void;
}

const CATEGORY_BASE_ORDER: Record<string, number> = {
  torres: 1000,
  massas: 2000,
  salgados: 3000,
  doces: 4000,
  bebidas: 5000,
};

function SortableProductItem({
  product,
  onEdit,
  onDelete,
  onToggleFeatured,
  onToggleActive,
  onToggleSoldOut,
}: {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onToggleFeatured: (id: number, currentFeatured: boolean) => void;
  onToggleActive: (id: number, currentActive: boolean) => void;
  onToggleSoldOut: (product: Product) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 px-4 py-3 hover:bg-np-wood-50 transition-colors bg-white ${
        !product.active ? "opacity-50" : ""
      } ${isDragging ? "shadow-lg z-50 relative scale-[1.01]" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-2 rounded-md text-np-purple-400 hover:text-np-purple-700 hover:bg-np-purple-50 transition-colors flex-shrink-0"
        title="Arrastar para ordenar"
      >
        <i className="ri-draggable text-xl"></i>
      </button>

      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-np-wood-100">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-np-wood-400">
            <i className="ri-image-line"></i>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-np-purple-900 truncate">{product.name}</p>

          {product.featured && (
            <span className="bg-np-gold-100 text-np-gold-700 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Destaque
            </span>
          )}

          {product.soldOut && (
            <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Esgotado
            </span>
          )}

          {!product.active && (
            <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Inativo
            </span>
          )}

          {product.minStock > 0 && product.stockQuantity <= product.minStock && (
            <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-1">
              <i className="ri-error-warning-line"></i>
              Estoque baixo ({product.stockQuantity})
            </span>
          )}
        </div>

        <p className="text-xs text-np-purple-500 truncate">
          {(product.description || "").slice(0, 60)}...
        </p>

        <p className="text-[10px] text-np-purple-400 mt-0.5">
          Estoque:{" "}
          <span
            className={
              product.minStock > 0 && product.stockQuantity <= product.minStock
                ? "text-red-600 font-bold"
                : "text-np-purple-600 font-medium"
            }
          >
            {product.stockQuantity}
          </span>
          {product.minStock > 0 && (
            <span className="text-np-purple-300"> / mín: {product.minStock}</span>
          )}
        </p>
      </div>

      <span className="text-sm font-bold text-np-purple-900 flex-shrink-0">
        {product.priceFormatted}
      </span>

      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(product)}
          className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
          title="Editar"
        >
          <i className="ri-edit-line"></i>
        </button>

        <button
          onClick={() => onToggleFeatured(product.id, product.featured)}
          className={`p-1.5 rounded-md transition-colors ${
            product.featured
              ? "bg-np-gold-100 text-np-gold-600 hover:bg-np-gold-200"
              : "bg-np-wood-100 text-np-wood-500 hover:bg-np-wood-200"
          }`}
          title={product.featured ? "Remover destaque" : "Destacar"}
        >
          <i className="ri-star-line"></i>
        </button>

        <button
          onClick={() => onToggleSoldOut(product)}
          className={`p-1.5 rounded-md transition-colors ${
            product.soldOut
              ? "bg-green-50 text-green-600 hover:bg-green-100"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          title={product.soldOut ? "Marcar como disponível" : "Marcar como esgotado"}
        >
          <i className={product.soldOut ? "ri-checkbox-circle-line" : "ri-forbid-2-line"}></i>
        </button>

        <button
          onClick={() => onToggleActive(product.id, product.active)}
          className={`p-1.5 rounded-md transition-colors ${
            product.active
              ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
              : "bg-green-50 text-green-600 hover:bg-green-100"
          }`}
          title={product.active ? "Desativar" : "Reativar"}
        >
          <i className={product.active ? "ri-eye-off-line" : "ri-eye-line"}></i>
        </button>

        <button
          onClick={() => onDelete(product.id)}
          className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          title="Remover"
        >
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  );
}

export default function ProductSortableList({
  products,
  onEdit,
  onDelete,
  onToggleFeatured,
  onToggleActive,
  refreshProducts,
  addToast,
}: ProductSortableListProps) {
  const [items, setItems] = useState<Product[]>(products);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(products);
  }, [products]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleToggleSoldOut = async (product: Product) => {
    const nextSoldOut = !product.soldOut;

    const { error } = await supabase
      .from("products")
      .update({ sold_out: nextSoldOut })
      .eq("id", product.id);

    if (error) {
      addToast?.("Erro ao atualizar esgotado", "error");
      return;
    }

    addToast?.(
      nextSoldOut ? "Produto marcado como esgotado" : "Produto marcado como disponível",
      "success"
    );

    refreshProducts();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    try {
      setSaving(true);

      const category = reordered[0]?.category || "";
      const baseOrder = CATEGORY_BASE_ORDER[category] ?? 9000;

      const updates = reordered.map((product, index) =>
        supabase
          .from("products")
          .update({ display_order: baseOrder + index + 1 })
          .eq("id", product.id)
      );

      const results = await Promise.all(updates);
      const hasError = results.some((result) => result.error);

      if (hasError) {
        addToast?.("Erro ao salvar nova ordem", "error");
        setItems(products);
        return;
      }

      addToast?.("Ordem do cardápio atualizada", "success");
      refreshProducts();
    } catch (error) {
      console.error("[PRODUCT SORT] error:", error);
      addToast?.("Erro ao salvar nova ordem", "error");
      setItems(products);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      {saving && (
        <div className="absolute top-2 right-3 z-20 bg-np-purple-700 text-white text-xs px-3 py-1 rounded-full shadow">
          Salvando ordem...
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-np-wood-100">
            {items.map((product) => (
              <SortableProductItem
                key={product.id}
                product={product}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleFeatured={onToggleFeatured}
                onToggleActive={onToggleActive}
                onToggleSoldOut={handleToggleSoldOut}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
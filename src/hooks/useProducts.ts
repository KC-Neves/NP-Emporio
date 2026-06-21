import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { type CustomizationOption, menuItems } from "@/mocks/menuData";

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  priceFormatted: string;
  category: string;
  image: string;
  featured: boolean;
  active: boolean;
  stockQuantity: number;
  minStock: number;
  alertStock: number;
  customizationOptions?: CustomizationOption[];
  rating?: number;
  ratingCount?: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon: string;
}

interface DbProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  featured: boolean;
  active: boolean;
  stock_quantity: number | null;
  min_stock: number | null;
  alert_stock: number | null;
  customization_options: unknown;
  created_at: string;
  rating: number | null;
  rating_count: number | null;
}

const CATEGORY_META: Record<string, { name: string; icon: string }> = {
  torres: { name: "Torres", icon: "ri-stack-line" },
  massas: { name: "Massas ao Vivo", icon: "ri-restaurant-2-line" },
  salgados: { name: "Salgados", icon: "ri-bowl-line" },
  doces: { name: "Sobremesas", icon: "ri-cake-3-line" },
  bebidas: { name: "Bebidas", icon: "ri-goblet-line" },
};

function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

function parsePrice(priceStr: string): number {
  return parseFloat(priceStr.replace("R$ ", "").replace(",", "."));
}

function mapDbToProduct(row: DbProduct): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: row.price,
    priceFormatted: formatPrice(row.price),
    category: row.category,
    image: row.image_url || "",
    featured: row.featured || false,
    active: row.active !== false,
    stockQuantity: row.stock_quantity ?? 0,
    minStock: row.min_stock ?? 0,
    alertStock: row.alert_stock ?? 0,
    customizationOptions: row.customization_options ? (row.customization_options as CustomizationOption[]) : undefined,
    rating: row.rating ?? undefined,
    ratingCount: row.rating_count ?? undefined,
  };
}

function mapMockItemToProduct(item: (typeof menuItems)[number]): Product {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: parsePrice(item.price),
    priceFormatted: item.price,
    category: item.category,
    image: item.image,
    featured: item.featured,
    active: true,
    stockQuantity: 0,
    minStock: 0,
    alertStock: 0,
    customizationOptions: (item as { customization_options?: CustomizationOption[] }).customization_options,
    rating: (item as { rating?: number }).rating,
    ratingCount: (item as { ratingCount?: number }).ratingCount,
  };
}

function deriveCategories(products: Product[]): MenuCategory[] {
  const seen = new Set<string>();
  const cats: MenuCategory[] = [];
  products.forEach((p) => {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      const meta = CATEGORY_META[p.category] || {
        name: p.category,
        icon: "ri-restaurant-line",
      };
      cats.push({ id: p.category, name: meta.name, icon: meta.icon });
    }
  });
  return cats;
}

function deduplicateProducts(products: Product[]): Product[] {
  const seen = new Set<number>();
  return products.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function getMockFallback(): { products: Product[]; categories: MenuCategory[] } {
  const mockProducts = menuItems.map(mapMockItemToProduct);
  return { products: mockProducts, categories: deriveCategories(mockProducts) };
}

export function useProducts(adminMode = false) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      try {
        setLoading(true);
        setError(null);
        let query = supabase.from("products").select("*").order("display_order").order("id");
        if (!adminMode) {
          query = query.eq("active", true);
        }
        const { data, error: queryError } = await query;

        if (queryError) {
          console.error("[PRODUCTS] query error:", queryError.message);
          if (isMounted) {
            setError(queryError.message);
            // Fallback para mocks em caso de erro (só se não tiver dados ainda)
            if (products.length === 0) {
              const fallback = getMockFallback();
              setProducts(fallback.products);
              setCategories(fallback.categories);
            }
          }
        } else if (data && isMounted) {
          const mapped = deduplicateProducts((data as DbProduct[]).map(mapDbToProduct));
          setProducts(mapped);
          setCategories(deriveCategories(mapped));
        }
      } catch (err) {
        console.error("[PRODUCTS] exception:", err);
        if (isMounted) {
          setError("Falha ao carregar produtos");
          if (products.length === 0) {
            const fallback = getMockFallback();
            setProducts(fallback.products);
            setCategories(fallback.categories);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProducts();

    // Realtime subscription
    const channel = supabase
      .channel("products-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [adminMode, fetchKey]);

  const updateProduct = async (
    id: number,
    updates: Partial<
      Pick<Product, "name" | "description" | "price" | "category" | "featured" | "active" | "stockQuantity" | "minStock" | "alertStock" | "customizationOptions"> & { image_url?: string }
    >
  ) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.featured !== undefined) dbUpdates.featured = updates.featured;
    if (updates.active !== undefined) dbUpdates.active = updates.active;
    if (updates.stockQuantity !== undefined) dbUpdates.stock_quantity = updates.stockQuantity;
    if (updates.minStock !== undefined) dbUpdates.min_stock = updates.minStock;
    if (updates.alertStock !== undefined) dbUpdates.alert_stock = updates.alertStock;
    if (updates.image_url !== undefined) dbUpdates.image_url = updates.image_url;
    if (updates.customizationOptions !== undefined) dbUpdates.customization_options = updates.customizationOptions;

    const { error } = await supabase
      .from("products")
      .update(dbUpdates)
      .eq("id", id)
      .select("*");

    return { error };
  };

  const deleteProduct = async (id: number) => {
    const { error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", id)
      .select("*");

    return { error };
  };

  const createProduct = async (data: {
    name: string;
    description: string;
    price: number;
    category: string;
    image_url?: string;
    stock_quantity?: number;
    min_stock?: number;
    alert_stock?: number;
    customization_options?: CustomizationOption[];
  }) => {
    const { error } = await supabase.from("products").insert({
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      image_url: data.image_url || null,
      active: true,
      featured: false,
      stock_quantity: data.stock_quantity ?? 0,
      min_stock: data.min_stock ?? 5,
      alert_stock: data.alert_stock ?? 10,
      customization_options: data.customization_options || null,
    }).select("*");

    return { error };
  };

  const refresh = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { products, categories, loading, error, updateProduct, deleteProduct, createProduct, refresh };
}
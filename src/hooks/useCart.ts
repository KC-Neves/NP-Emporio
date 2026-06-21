import { useState, useEffect } from 'react';

export interface CartItemCustomization {
  groupId: string;
  groupName: string;
  selectedIds: string[];
  selectedLabels: string[];
  extraPrice: number;
}

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image: string;
  cartId: string;
  customizations?: CartItemCustomization[];
}

function generateCartId(itemId: number, customizations?: CartItemCustomization[]): string {
  if (!customizations || customizations.length === 0) return `item-${itemId}`;
  const hash = customizations.map(c => `${c.groupId}:${c.selectedIds.sort().join(',')}`).join('|');
  return `item-${itemId}-${hash}`;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem('np_cart');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      // Filter out invalid/corrupted items
      return parsed.filter((item: any) => item && typeof item === 'object' && item.id && item.name && typeof item.price === 'number' && !Number.isNaN(item.price) && item.cartId);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('np_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartItem, 'quantity' | 'cartId'>, customizations?: CartItemCustomization[]) => {
    const cartId = generateCartId(item.id, customizations);
    const extraPrice = customizations?.reduce((sum, c) => sum + c.extraPrice, 0) ?? 0;
    const finalPrice = item.price + extraPrice;

    setItems((prev) => {
      const existing = prev.find((i) => i.cartId === cartId);
      if (existing) {
        return prev.map((i) =>
          i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, cartId, quantity: 1, price: finalPrice, customizations }];
    });
  };

  const removeItem = (cartId: string) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const updateQuantity = (cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, addItem, removeItem, updateQuantity, clearCart, total, itemCount };
}
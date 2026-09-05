import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cartId, setCartId] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [loadingCart, setLoadingCart] = useState(true);

  // Initialize cart & fetch items
  useEffect(() => {
    if (!user) {
      setCartId(null);
      setCartItems([]);
      setLoadingCart(false);
      return;
    }

    const initCart = async () => {
      setLoadingCart(true);
      try {
        // 1. Get or create cart for buyer
        let { data: cart, error: cartErr } = await supabase
          .from('buyer_carts')
          .select('id')
          .eq('buyer_id', user.uid)
          .single();

        if (cartErr && cartErr.code === 'PGRST116') {
          // Cart doesn't exist, create it
          const { data: newCart, error: insertErr } = await supabase
            .from('buyer_carts')
            .insert([{ buyer_id: user.uid }])
            .select('id')
            .single();
            
          if (insertErr) throw insertErr;
          cart = newCart;
        } else if (cartErr) {
          throw cartErr;
        }

        setCartId(cart.id);

        // 2. Fetch items with current listing details (for price/stock validation)
        await fetchCartItems(cart.id);

      } catch (err) {
        console.error("Cart init error:", err);
      } finally {
        setLoadingCart(false);
      }
    };

    initCart();
  }, [user]);

  const fetchCartItems = async (cId) => {
    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        listings ( price_per_unit, quantity, status, minimum_order_quantity )
      `)
      .eq('cart_id', cId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setCartItems(data);
    }
  };

  // Real-time subscription on cart_items
  useEffect(() => {
    if (!cartId) return;

    const channel = supabase.channel('cart_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'cart_items',
        filter: `cart_id=eq.${cartId}`
      }, () => {
        fetchCartItems(cartId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartId]);

  const addToCart = async (listing, quantity) => {
    if (!cartId || !user) return { success: false, error: 'Not authenticated or cart not ready' };
    
    // Check if item already in cart
    const existing = cartItems.find(item => item.listing_id === listing.id);
    
    if (existing) {
      // Update quantity
      const newQty = Number(existing.quantity) + Number(quantity);
      if (newQty > listing.quantity) {
        return { success: false, error: 'Cannot exceed available stock' };
      }
      return updateQuantity(existing.id, newQty);
    } else {
      // Insert new
      const { error } = await supabase
        .from('cart_items')
        .insert([{
          cart_id: cartId,
          listing_id: listing.id,
          farmer_id: listing.farmer_id,
          produce_name: listing.produce_name,
          quantity: quantity,
          unit: listing.unit,
          price_per_unit: listing.price_per_unit
        }]);

      if (error) {
        console.error("Add to cart error:", error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }
  };

  const updateQuantity = async (itemId, newQuantity) => {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      console.error("Update quantity error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const removeFromCart = async (itemId) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error("Remove from cart error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const clearCartLocal = () => {
    setCartItems([]);
  };

  const itemCount = cartItems.length;
  
  // Calculate total using the *current* listing price from the joined data if available,
  // falling back to the snapshot price if the join failed for some reason.
  const cartTotal = cartItems.reduce((sum, item) => {
    const currentPrice = item.listings?.price_per_unit || item.price_per_unit;
    return sum + (Number(item.quantity) * Number(currentPrice));
  }, 0);

  const value = {
    cartId,
    cartItems,
    itemCount,
    cartTotal,
    loadingCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCartLocal
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

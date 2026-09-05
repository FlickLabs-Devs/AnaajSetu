-- AnaajSetu Phase 7: Buyer Cart & Grouped Order History

-- ============================================================
-- 1. Create Buyer Carts Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.buyer_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cart_buyer FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- 2. Create Cart Items Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL,
    listing_id UUID NOT NULL,
    farmer_id TEXT NOT NULL,
    produce_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    price_per_unit NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_cart_item UNIQUE (cart_id, listing_id),
    CONSTRAINT fk_cartitem_cart FOREIGN KEY (cart_id) REFERENCES public.buyer_carts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cartitem_listing FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
    CONSTRAINT fk_cartitem_farmer FOREIGN KEY (farmer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT valid_cart_quantity CHECK (quantity > 0)
);

-- ============================================================
-- 3. Create Order Groups Table (for checkout)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ordergroup_buyer FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Add order_group_id to orders table (nullable for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='orders' AND column_name='order_group_id'
    ) THEN
        ALTER TABLE public.orders 
        ADD COLUMN order_group_id UUID REFERENCES public.order_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- Indexes and Triggers
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cartitems_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cartitems_listing_id ON public.cart_items(listing_id);
CREATE INDEX IF NOT EXISTS idx_ordergroups_buyer_id ON public.order_groups(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_group_id ON public.orders(order_group_id);

DROP TRIGGER IF EXISTS update_buyer_carts_updated_at ON public.buyer_carts;
CREATE TRIGGER update_buyer_carts_updated_at BEFORE UPDATE ON public.buyer_carts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_groups_updated_at ON public.order_groups;
CREATE TRIGGER update_order_groups_updated_at BEFORE UPDATE ON public.order_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Realtime
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cart_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
    END IF;
END $$;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.buyer_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;

-- Allow anon access since app relies on Firebase client-side filtering currently
CREATE POLICY "Allow anon select buyer_carts" ON public.buyer_carts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert buyer_carts" ON public.buyer_carts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update buyer_carts" ON public.buyer_carts FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete buyer_carts" ON public.buyer_carts FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select cart_items" ON public.cart_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert cart_items" ON public.cart_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update cart_items" ON public.cart_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete cart_items" ON public.cart_items FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select order_groups" ON public.order_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert order_groups" ON public.order_groups FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update order_groups" ON public.order_groups FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete order_groups" ON public.order_groups FOR DELETE TO anon USING (true);

-- ============================================================
-- Atomic Checkout RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.checkout_cart(p_buyer_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cart RECORD;
    v_item RECORD;
    v_listing RECORD;
    v_group_id UUID;
    v_request_id UUID;
    v_order_id UUID;
    v_group_total NUMERIC := 0;
    v_item_subtotal NUMERIC := 0;
BEGIN
    -- 1. Get and lock the cart
    SELECT * INTO v_cart FROM public.buyer_carts WHERE buyer_id = p_buyer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found';
    END IF;

    -- 2. Create the order group first
    INSERT INTO public.order_groups (buyer_id, status, total_amount)
    VALUES (p_buyer_id, 'processing', 0)
    RETURNING id INTO v_group_id;

    -- 3. Loop through cart items with locking
    FOR v_item IN (SELECT * FROM public.cart_items WHERE cart_id = v_cart.id ORDER BY created_at FOR UPDATE) LOOP
        -- Lock listing
        SELECT * INTO v_listing FROM public.listings WHERE id = v_item.listing_id FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Listing % no longer exists', v_item.produce_name;
        END IF;

        IF v_listing.status != 'active' THEN
            RAISE EXCEPTION 'Listing % is not active', v_listing.produce_name;
        END IF;

        IF v_listing.quantity < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %', v_listing.produce_name;
        END IF;
        
        IF v_item.quantity < v_listing.minimum_order_quantity THEN
            RAISE EXCEPTION 'Quantity for % is below minimum order requirement', v_listing.produce_name;
        END IF;

        -- Calculate total using CURRENT price
        v_item_subtotal := v_item.quantity * v_listing.price_per_unit;
        v_group_total := v_group_total + v_item_subtotal;

        -- Create request matching standard architecture
        INSERT INTO public.requests (
            listing_id, buyer_id, farmer_id, requested_quantity, unit, offered_price_per_unit, status, message
        ) VALUES (
            v_listing.id, p_buyer_id, v_listing.farmer_id, v_item.quantity, v_listing.unit, v_listing.price_per_unit, 'accepted', 'Cart Purchase'
        ) RETURNING id INTO v_request_id;

        -- Create order linked to group and request
        INSERT INTO public.orders (
            request_id, listing_id, buyer_id, farmer_id, produce_name, quantity, unit, price_per_unit, total_amount, status, order_group_id
        ) VALUES (
            v_request_id, v_listing.id, p_buyer_id, v_listing.farmer_id, v_listing.produce_name, v_item.quantity, v_listing.unit, v_listing.price_per_unit, v_item_subtotal, 'accepted', v_group_id
        );

        -- Decrement listing quantity safely
        UPDATE public.listings 
        SET quantity = quantity - v_item.quantity,
            status = CASE WHEN (quantity - v_item.quantity) <= 0 THEN 'sold_out' ELSE status END,
            updated_at = NOW()
        WHERE id = v_listing.id;
    END LOOP;

    -- If no items were processed, fail
    IF v_group_total = 0 THEN
        RAISE EXCEPTION 'Cart is empty or all items were invalid';
    END IF;

    -- 4. Update the order group total
    UPDATE public.order_groups SET total_amount = v_group_total WHERE id = v_group_id;

    -- 5. Clear the cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart.id;

    RETURN jsonb_build_object('success', true, 'order_group_id', v_group_id);
END;
$$;

    
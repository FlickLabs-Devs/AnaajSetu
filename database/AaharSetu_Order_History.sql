-- AaharSetu Phase 6: Order History

-- Create the orders table as a persistent snapshot of transactions
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID UNIQUE NOT NULL,
    listing_id UUID, -- Optional link, no CASCADE delete so history persists
    buyer_id TEXT NOT NULL,
    farmer_id TEXT NOT NULL,
    produce_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    price_per_unit NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_order_quantity CHECK (quantity > 0),
    CONSTRAINT valid_order_price CHECK (price_per_unit >= 0),
    CONSTRAINT valid_order_status CHECK (status IN ('accepted', 'completed', 'cancelled')),
    
    CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_farmer FOREIGN KEY (farmer_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Indexes for fast retrieval by user
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id ON public.orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow anon access since the application filters by Firebase UID client-side in the prototype
CREATE POLICY "Allow anon select orders" ON public.orders FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert orders" ON public.orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update orders" ON public.orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete orders" ON public.orders FOR DELETE TO anon USING (true);

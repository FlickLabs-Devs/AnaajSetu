-- AaharSetu Phase 7: Order OTP Completion

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Modify public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS completion_otp_hash TEXT,
ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Create restricted table for plain-text OTPs accessible ONLY via RPC
CREATE TABLE IF NOT EXISTS public.order_secrets (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    buyer_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    otp TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS but do NOT create anon policies for order_secrets.
-- This makes the table completely inaccessible from the frontend API directly.
ALTER TABLE public.order_secrets ENABLE ROW LEVEL SECURITY;

-- 3. RPC to generate OTP (Called after order is created)
CREATE OR REPLACE FUNCTION public.generate_order_otp(p_order_id UUID, p_caller_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_otp TEXT;
BEGIN
    -- Get the order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status != 'accepted' THEN
        RAISE EXCEPTION 'Order is not accepted';
    END IF;

    -- Generate a 6-digit random OTP
    v_otp := lpad(floor(random() * 1000000)::text, 6, '0');

    -- Insert raw OTP into private secrets table
    INSERT INTO public.order_secrets (order_id, buyer_id, otp)
    VALUES (p_order_id, v_order.buyer_id, v_otp)
    ON CONFLICT (order_id) DO NOTHING; -- If already generated, do nothing

    -- Update order with hash
    UPDATE public.orders
    SET completion_otp_hash = crypt(v_otp, gen_salt('bf'))
    WHERE id = p_order_id;
END;
$$;

-- 4. RPC for buyer to fetch their OTP
CREATE OR REPLACE FUNCTION public.get_buyer_otp(p_order_id UUID, p_buyer_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
BEGIN
    SELECT otp INTO v_otp
    FROM public.order_secrets
    WHERE order_id = p_order_id AND buyer_id = p_buyer_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN v_otp;
END;
$$;

-- 5. RPC to verify OTP and complete order
CREATE OR REPLACE FUNCTION public.verify_order_otp(p_order_id UUID, p_farmer_id TEXT, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    -- Lock the row for update to prevent race conditions
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Authorize farmer
    IF v_order.farmer_id != p_farmer_id THEN
        RAISE EXCEPTION 'Unauthorized: Only the assigned farmer can complete this order';
    END IF;

    IF v_order.status = 'completed' THEN
        RAISE EXCEPTION 'Order is already completed';
    END IF;

    IF v_order.status != 'accepted' THEN
        RAISE EXCEPTION 'Order is not in accepted status';
    END IF;

    IF v_order.completion_otp_hash IS NULL THEN
        RAISE EXCEPTION 'Verification code unavailable for this order';
    END IF;

    -- Compare hash
    IF v_order.completion_otp_hash = crypt(p_otp, v_order.completion_otp_hash) THEN
        -- Atomic update
        UPDATE public.orders
        SET status = 'completed',
            otp_verified_at = NOW(),
            completed_at = NOW()
        WHERE id = p_order_id;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- ============================================================
-- AnaajSetu Smart Bargaining Fix
-- Enforces 3-counter limit in the database.
-- ============================================================

CREATE OR REPLACE FUNCTION check_counter_offer_limit()
RETURNS trigger AS $$
DECLARE
    counter_count int;
BEGIN
    IF NEW.offer_type = 'counter' THEN
        SELECT count(*) INTO counter_count
        FROM public.negotiation_offers
        WHERE negotiation_id = NEW.negotiation_id
          AND offer_type = 'counter';
          
        IF counter_count >= 3 THEN
            RAISE EXCEPTION 'Maximum counter-offer limit (3) reached for this negotiation.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_counter_limit ON public.negotiation_offers;

CREATE TRIGGER enforce_counter_limit
    BEFORE INSERT ON public.negotiation_offers
    FOR EACH ROW EXECUTE FUNCTION check_counter_offer_limit();

-- AaharSetu_Phase_5_Phone_Contacts.sql
-- Adds phone_number column to public.profiles safely

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT;

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gbjjzqzkkmuxrizxnuta.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdiamp6cXpra211eHJpenhudXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTE0NjUsImV4cCI6MjEwMjk4NzQ2NX0.vMqD6uUt348h6fJnC6vr8MxmvOHQtgGE_h-UB_NqS7E";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

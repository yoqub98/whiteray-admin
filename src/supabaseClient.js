// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Для разработки используем переменные окружения из .env.local
// Для продакшена Vercel автоматически подставляет значения из настроек проекта
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Добавим отладочную информацию
console.log('Supabase URL exists:', !!supabaseUrl);
console.log('Supabase Key exists:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "❌ Missing Supabase environment variables. Make sure REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY are set in Vercel project settings."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
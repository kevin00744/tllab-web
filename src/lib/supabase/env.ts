function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`缺少環境變數 ${name}，請參考 .env.example 設定後重新編譯。`);
  }
  return value;
}

// NEXT_PUBLIC_* 必須以字面值存取，Next.js 才會在編譯時代入
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

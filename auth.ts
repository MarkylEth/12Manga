// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const pool = new Pool({
  connectionString: need("DATABASE_URL"),
});
pool.on("connect", (c) =>
  c.query("SET search_path TO authjs, public").catch(console.error)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Google({
      clientId: need("GOOGLE_CLIENT_ID"),
      clientSecret: need("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  secret: need("AUTH_SECRET"),
  trustHost: true,
  debug: true, // можно убрать после отладки
});

import { Pool } from "pg";
import { env } from "./env";

const g = globalThis as unknown as { __pool?: Pool };
export function pool() {
  g.__pool ??= new Pool({ connectionString: env.databaseUrl, max: 8 });
  return g.__pool;
}

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: z.string().default("true"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_BUCKET: z.string().min(1).default("zein-media"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().min(1).default("us-east-1"),
  MAP_PROVIDER: z.enum(["osm", "google", "mapbox"]).default("osm"),
  MAP_TOKEN: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().email().default("admin@zainagency.com"),
  ADMIN_PASSWORD: z.string().min(12).default("change-me-now"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration — fix .env (see .env.example) and restart.");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

export const isTrustedHost = env.AUTH_TRUST_HOST !== "false";
export const trustHost = isTrustedHost;
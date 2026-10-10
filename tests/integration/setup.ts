import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("integration tests require DATABASE_URL");
}
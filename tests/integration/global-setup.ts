import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileP = promisify(execFile);

let baseDatasource: string | null = null;
let dbName: string | null = null;

export async function setup() {
  const datasource = process.env.DATABASE_URL;
  if (!datasource) {
    throw new Error(
      "integration tests require DATABASE_URL (pointing at a disposable Postgres instance)",
    );
  }
  baseDatasource = datasource;

  const admin = new Client({ connectionString: datasource });
  await admin.connect();
  dbName = `zein_test_${randomUUID().slice(0, 8)}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const url = new URL(datasource);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();

  const env = { ...process.env };
  await execFileP("pnpm", ["prisma", "migrate", "deploy"], {
    env,
    shell: process.platform === "win32",
    cwd: process.cwd(),
  });
}

export async function teardown() {
  if (!baseDatasource || !dbName) return;
  process.env.DATABASE_URL = baseDatasource;
  const admin = new Client({ connectionString: baseDatasource });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}
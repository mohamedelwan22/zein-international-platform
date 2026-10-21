This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local development prerequisites

The app talks to PostgreSQL through the Docker Compose dev stack. **The database
must be running before `pnpm dev`** — every page that reads content (home,
directories, catalog) queries it on the server.

```bash
pnpm db:up      # docker compose up -d  (postgres on :5434, minio on :9100)
pnpm db:down    # docker compose down
```

`DATABASE_URL` in `.env` points at `postgresql://zein:zein@localhost:5434/zein`
(see `.env.example`).

> **Diagnosing a Prisma error that mentions `findUnique`/`findMany`:**
> Prisma 7 with the `pg` driver adapter reports an unreachable database as
> `PrismaClientKnownRequestError` with `code: "ECONNREFUSED"` — *not* the more
> familiar `PrismaClientInitializationError` / `P1001`. The invocation shown in
> the message is the first query that happened to run, not a schema problem.
> Check that the container is up (`docker compose ps`) before looking at the
> schema or the generated client.

Apply the schema to the dev database with `pnpm db:migrate` (creates missing
tables; additive, non-destructive). `pnpm db:seed` loads the approved seed
content.

## Getting Started

First, start the dev services (see prerequisites above), then run the
development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

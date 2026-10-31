import { defineConfig } from 'drizzle-kit';

// Used only to generate SQL migrations from src/db/schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});

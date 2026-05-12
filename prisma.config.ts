import { defineConfig } from '@prisma/internals';

export default defineConfig({
  dbUrl: process.env.DATABASE_URL,
});

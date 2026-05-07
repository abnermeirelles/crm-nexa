import { z } from 'zod';

const schema = z.object({
  API_URL: z
    .string()
    .url()
    .default('http://localhost:3001'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

const raw = {
  API_URL: process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV,
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error('Invalid web env:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables — see logs.');
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Standalone output: gera .next/standalone/server.js + node_modules
  // minimo, reduzindo a imagem Docker substancialmente.
  output: 'standalone',
  // outputFileTracingRoot e necessario em monorepos para o tracer
  // do Next encontrar dependencias acima do diretorio de apps/web.
  outputFileTracingRoot: join(__dirname, '../..'),
};

export default nextConfig;

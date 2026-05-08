import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output: gera .next/standalone/server.js + node_modules
  // minimo, reduzindo a imagem Docker substancialmente.
  output: 'standalone',
  // outputFileTracingRoot e necessario em monorepos para o tracer
  // do Next encontrar dependencias acima do diretorio de apps/web.
  // process.cwd() em build/dev = apps/web/, entao .. .. = raiz do repo.
  outputFileTracingRoot: join(process.cwd(), '..', '..'),
};

export default nextConfig;

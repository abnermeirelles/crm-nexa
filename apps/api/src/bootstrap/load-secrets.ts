import { readFileSync } from 'node:fs';

// Convencao *_FILE (mesma usada pelas imagens oficiais do Postgres,
// MySQL, etc.): se ${NAME}_FILE estiver setado, le o conteudo do
// arquivo e popula process.env[NAME]. Permite que Docker Swarm secrets
// (mountados em /run/secrets/<name>) sejam consumidos sem mudanca de
// codigo nos consumidores (Prisma, ConfigService, etc.).
//
// Executa como SIDE EFFECT no carregamento deste modulo. main.ts deve
// importa-lo ANTES de qualquer modulo que leia process.env.

const FILE_SUFFIX = '_FILE';

function loadSecretsFromFiles(): void {
  for (const key of Object.keys(process.env)) {
    if (!key.endsWith(FILE_SUFFIX)) continue;

    const filePath = process.env[key];
    if (!filePath) continue;

    const baseKey = key.slice(0, -FILE_SUFFIX.length);

    if (process.env[baseKey] !== undefined && process.env[baseKey] !== '') {
      // Ambos setados — explicit env wins. Util em dev local quando
      // alguem deixa o _FILE no shell por engano.
      // eslint-disable-next-line no-console
      console.warn(
        `[load-secrets] ${baseKey} already set in env; ignoring ${key}=${filePath}`,
      );
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf8').replace(/\s+$/, '');
      process.env[baseKey] = content;
    } catch (err) {
      throw new Error(
        `[load-secrets] failed to read ${baseKey} from ${filePath}: ${(err as Error).message}`,
      );
    }
  }
}

loadSecretsFromFiles();

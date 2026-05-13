export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  api: {
    port: number;
  };
  database: {
    url: string;
    adminUrl: string;
  };
  redis: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value === '' || value.startsWith('CHANGE_ME')) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadConfiguration(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    api: {
      port: Number(process.env.API_PORT ?? 3001),
    },
    database: {
      url: required('DATABASE_URL'),
      adminUrl: required('DATABASE_ADMIN_URL'),
    },
    redis: {
      url: required('REDIS_URL'),
    },
    jwt: {
      accessSecret: required('JWT_ACCESS_SECRET'),
      refreshSecret: required('JWT_REFRESH_SECRET'),
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
  };
}

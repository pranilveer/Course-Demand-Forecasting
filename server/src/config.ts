import 'dotenv/config';

export interface AppConfig {
  mongoUri: string;
  mongoDb: string;
  port: number;
  clientOrigin: string;
  nodeEnv: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config: AppConfig = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
  mongoDb: process.env.MONGODB_DB ?? 'yottaflex',
  port: readNumber(process.env.PORT, 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

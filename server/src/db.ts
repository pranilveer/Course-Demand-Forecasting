import mongoose, { type Model } from 'mongoose';
import { models } from './models/index.js';

export async function connectDb(uri: string, dbName: string): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 15_000,
  });
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export async function dropDb(): Promise<void> {
  if (!mongoose.connection.db) {
    throw new Error('Cannot drop database before connecting to MongoDB');
  }
  await mongoose.connection.db.dropDatabase();
}

export async function insertBatched<T>(
  model: Model<T>,
  docs: T[],
  batchSize = 1_000,
): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < docs.length; index += batchSize) {
    const batch = docs.slice(index, index + batchSize);
    if (batch.length === 0) {
      continue;
    }
    await model.insertMany(batch, { ordered: true });
    inserted += batch.length;
  }
  return inserted;
}

import {
  COLLECTION_NAMES,
  type CollectionDocument,
  type CollectionName,
} from '@yottaflex/shared';
import { models } from '../models/index.js';

export type LoadedCollections = {
  [K in CollectionName]: CollectionDocument<K>[];
};

export async function loadCollections(): Promise<LoadedCollections> {
  const entries = await Promise.all(
    COLLECTION_NAMES.map(async (name) => {
      const documents = await models[name].find({}).sort({ _id: 1 }).lean().exec();
      return [name, documents] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as LoadedCollections;
}

export async function countCollections(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    COLLECTION_NAMES.map(async (name) => {
      const count = await models[name].countDocuments({});
      return [name, count] as const;
    }),
  );
  return Object.fromEntries(entries);
}

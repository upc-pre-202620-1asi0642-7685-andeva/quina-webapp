import type { ImageStorage } from '@/core/domain/ports/image-storage';
import { LocalImageStorage } from './local-image-storage';
import { SupabaseImageStorage } from './supabase-image-storage';

let cached: ImageStorage | undefined;

export function createImageStorage(env: NodeJS.ProcessEnv = process.env): ImageStorage {
  const transport = env.STORAGE_TRANSPORT || (env.NODE_ENV === 'production' ? 'supabase' : 'local');

  if (transport === 'local') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('STORAGE_TRANSPORT=local is not allowed when VERCEL_ENV=production');
    }
    return new LocalImageStorage();
  }
  if (transport === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage');
    }
    return new SupabaseImageStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  throw new Error(`Unknown STORAGE_TRANSPORT: ${transport}`);
}

export function getImageStorage(): ImageStorage {
  cached ??= createImageStorage();
  return cached;
}

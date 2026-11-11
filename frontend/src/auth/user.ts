import type { User } from '@supabase/supabase-js'

export function getUserDisplayName(user: User): string {
  const metadataName = user.user_metadata?.display_name
    ?? user.user_metadata?.full_name
    ?? user.user_metadata?.name

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim()
  }

  return user.email?.split('@')[0] || 'Account'
}

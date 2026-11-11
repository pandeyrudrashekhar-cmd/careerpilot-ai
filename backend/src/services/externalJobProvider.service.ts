import type { JobSearchQuery } from '../validation/job.schema'
import { ApiError } from '../utils/ApiError'

export type ExternalJobSearchQuery = Omit<JobSearchQuery, 'provider' | 'sortBy' | 'sortOrder'>

export interface ExternalJobListing {
  title: string
  company: string
  description: string
  requiredSkills: string[]
  optionalSkills: string[]
  location?: string
  remoteStatus: 'ONSITE' | 'HYBRID' | 'REMOTE' | 'UNSPECIFIED'
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY' | 'INTERNSHIP' | 'APPRENTICESHIP' | 'OTHER'
  applicationUrl?: string
  postedAt?: string
}

export interface ExternalJobSearchResult {
  jobs: ExternalJobListing[]
  total?: number
  nextPageToken?: string
}

export interface ExternalJobProvider {
  readonly name: string
  search(query: ExternalJobSearchQuery): Promise<ExternalJobSearchResult>
}

export function createExternalJobProviderRegistry(providers: readonly ExternalJobProvider[] = []) {
  const providersByName = new Map(providers.map((provider) => [provider.name.toLocaleLowerCase('en'), provider]))

  return {
    async search(providerName: string, query: ExternalJobSearchQuery) {
      const provider = providersByName.get(providerName.toLocaleLowerCase('en'))
      if (!provider) {
        throw new ApiError(501, `External job provider "${providerName}" is not configured`)
      }
      return provider.search(query)
    },
  }
}

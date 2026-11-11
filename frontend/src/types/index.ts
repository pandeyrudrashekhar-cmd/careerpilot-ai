import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  href: string
  icon?: string
  badge?: string | number
}

export interface StatCard {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
}

export interface Job {
  id: string
  title: string
  company: string
  location: string
  type: 'Full-time' | 'Internship' | 'Contract' | 'Part-time'
  matchScore: number
  postedAt: string
  tags: string[]
  logo?: string
}

export interface Application {
  id: string
  company: string
  role: string
  status: 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Rejected'
  appliedAt: string
  nextStep?: string
}

export interface Skill {
  name: string
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
  category: string
  matched?: boolean
}

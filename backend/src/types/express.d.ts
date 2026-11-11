export interface AuthenticatedUser {
  userId: string
  accessToken: string
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser
    }
  }
}

export {}

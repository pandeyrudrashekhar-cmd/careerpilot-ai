import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { getProfile, updateProfile } from '../controllers/profile.controller'

const profileRouter = Router()

profileRouter.use(authenticate)
profileRouter.get('/', getProfile)
profileRouter.patch('/', updateProfile)

export default profileRouter

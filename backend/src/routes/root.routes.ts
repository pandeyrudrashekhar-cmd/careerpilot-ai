import { Router } from 'express'
import { getWelcome } from '../controllers/root.controller'

const rootRouter = Router()

rootRouter.get('/', getWelcome)

export default rootRouter

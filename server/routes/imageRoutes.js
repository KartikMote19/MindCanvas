import express from 'express'
import { generateImage } from '../controllers/imageController.js'
import useAuth from '../middlewares/auth.js'

const imageRouter = express.Router()

imageRouter.post('/generate-image', useAuth, generateImage)

export default imageRouter
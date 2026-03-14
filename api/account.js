import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET /api/account — return current user profile
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, darkMode: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// PUT /api/account — update user preferences
router.put('/', async (req, res, next) => {
  try {
    const { userId } = req.user
    const { darkMode } = req.body
    const data = {}
    if (typeof darkMode === 'boolean') data.darkMode = darkMode

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, darkMode: true },
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

export default router

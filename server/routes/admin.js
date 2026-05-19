import { Router } from 'express'
import bcrypt from 'bcrypt'
import prisma from '../../lib/prisma.js'

const router = Router()
const SALT_ROUNDS = 12
const VALID_ROLES = ['user', 'admin']

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  darkMode: true,
  createdAt: true,
  _count: {
    select: {
      meals: true,
      workouts: true,
      waterEntries: true,
      healthData: true,
    },
  },
}

// GET /api/admin/users — list every user
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    res.json(users)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/users/:id — single user
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id — update name / role / darkMode
router.put('/users/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    const { name, role, darkMode } = req.body
    const data = {}

    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' })
      }
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > 100) {
        return res.status(400).json({ error: 'name must be between 1 and 100 characters' })
      }
      data.name = trimmed
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` })
      }
      data.role = role
    }

    if (darkMode !== undefined) {
      if (typeof darkMode !== 'boolean') {
        return res.status(400).json({ error: 'darkMode must be a boolean' })
      }
      data.darkMode = darkMode
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided' })
    }

    // Wrap last-admin check + update in a serializable transaction so two
    // concurrent demotions can't both observe adminCount > 1 and leave zero admins.
    const demotingAdmin = target.role === 'admin' && data.role === 'user'
    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          if (demotingAdmin) {
            const adminCount = await tx.user.count({ where: { role: 'admin' } })
            if (adminCount <= 1) {
              const err = new Error('Cannot demote the last admin')
              err.code = 'LAST_ADMIN'
              throw err
            }
          }
          return tx.user.update({
            where: { id: target.id },
            data,
            select: USER_SELECT,
          })
        },
        { isolationLevel: 'Serializable' },
      )
      res.json(updated)
    } catch (err) {
      if (err.code === 'LAST_ADMIN') {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/password — admin sets a new password directly
router.put('/users/:id/password', async (req, res, next) => {
  try {
    const { newPassword } = req.body
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' })
    }

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS)
    // Atomically rotate the password and invalidate any outstanding self-serve
    // reset tokens so a stale 6-digit code can't still be redeemed.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: target.id, used: false },
        data: { used: true },
      }),
    ])

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/users/:id — delete user (cascades to all related rows)
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.user.userId === req.params.id) {
      return res.status(400).json({ error: 'Admins cannot delete their own account' })
    }

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    // Serializable so a delete + demote (or two deletes) can't race past the guard.
    try {
      await prisma.$transaction(
        async (tx) => {
          if (target.role === 'admin') {
            const adminCount = await tx.user.count({ where: { role: 'admin' } })
            if (adminCount <= 1) {
              const err = new Error('Cannot delete the last admin')
              err.code = 'LAST_ADMIN'
              throw err
            }
          }
          await tx.user.delete({ where: { id: target.id } })
        },
        { isolationLevel: 'Serializable' },
      )
      res.status(204).end()
    } catch (err) {
      if (err.code === 'LAST_ADMIN') {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }
  } catch (err) {
    next(err)
  }
})

export default router

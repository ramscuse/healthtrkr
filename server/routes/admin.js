import { Router } from 'express'
import bcrypt from 'bcrypt'
import prisma from '../../lib/prisma.js'
import { validatePassword } from '../lib/passwordPolicy.js'

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

// GET /api/admin/audit — paginated admin action log
router.get('/audit', async (req, res, next) => {
  try {
    const { targetUserId, adminId } = req.query
    const rawLimit = parseInt(req.query.limit, 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50

    const where = {}
    if (typeof targetUserId === 'string') where.targetUserId = targetUserId
    if (typeof adminId === 'string') where.adminId = adminId

    const entries = await prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        admin: { select: { id: true, email: true, name: true } },
        target: { select: { id: true, email: true, name: true } },
      },
    })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id — update name / role / darkMode
router.put('/users/:id', async (req, res, next) => {
  try {
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

    const actorId = req.user.userId

    // Read target inside the transaction so the last-admin check operates on
    // the same snapshot as the update — prevents a concurrent demotion from
    // making `target.role` stale and slipping past the guard.
    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, role: true, darkMode: true },
          })
          if (!target) {
            const err = new Error('User not found')
            err.code = 'NOT_FOUND'
            throw err
          }

          if (target.role === 'admin' && data.role === 'user') {
            const adminCount = await tx.user.count({ where: { role: 'admin' } })
            if (adminCount <= 1) {
              const err = new Error('Cannot demote the last admin')
              err.code = 'LAST_ADMIN'
              throw err
            }
          }

          const updatedUser = await tx.user.update({
            where: { id: target.id },
            data,
            select: USER_SELECT,
          })

          // Capture only the fields that actually changed so the audit row
          // tells a reviewer "what did this admin alter" at a glance.
          const before = {}
          const after = {}
          for (const key of Object.keys(data)) {
            if (target[key] !== data[key]) {
              before[key] = target[key]
              after[key] = data[key]
            }
          }
          const action = 'role' in after ? 'ROLE_CHANGE' : 'PROFILE_UPDATE'
          if (Object.keys(after).length > 0) {
            await tx.adminAuditLog.create({
              data: {
                adminId: actorId,
                targetUserId: target.id,
                action,
                before,
                after,
              },
            })
          }

          return updatedUser
        },
        { isolationLevel: 'Serializable' },
      )
      res.json(updated)
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
      if (err.code === 'LAST_ADMIN') return res.status(400).json({ error: err.message })
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
    const passwordError = validatePassword(newPassword)
    if (passwordError) return res.status(400).json({ error: passwordError })

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, name: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS)
    const actorId = req.user.userId

    // Atomically rotate the password, bump tokenVersion to invalidate any
    // active sessions for the target user, invalidate outstanding self-serve
    // reset tokens so a stale 6-digit code can't still be redeemed, and
    // record the admin action. Identity is snapshotted into `before` so the
    // audit row stays readable even if the target is later deleted (SetNull
    // FK clears `targetUserId`).
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { password: hashed, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: target.id, used: false },
        data: { used: true },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: actorId,
          targetUserId: target.id,
          action: 'PASSWORD_RESET',
          before: { email: target.email, name: target.name },
        },
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

    const actorId = req.user.userId

    // Read target inside the transaction so the last-admin check sees the
    // same snapshot as the delete (a concurrent demote-then-delete pair would
    // otherwise both observe a stale role and could empty the admin set).
    try {
      await prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, email: true, name: true, role: true },
          })
          if (!target) {
            const err = new Error('User not found')
            err.code = 'NOT_FOUND'
            throw err
          }
          if (target.role === 'admin') {
            const adminCount = await tx.user.count({ where: { role: 'admin' } })
            if (adminCount <= 1) {
              const err = new Error('Cannot delete the last admin')
              err.code = 'LAST_ADMIN'
              throw err
            }
          }
          // Capture identity in `before` so the log row stays meaningful once
          // the target FK is null-ed out by the cascade SetNull.
          await tx.adminAuditLog.create({
            data: {
              adminId: actorId,
              targetUserId: target.id,
              action: 'DELETE',
              before: { email: target.email, name: target.name, role: target.role },
            },
          })
          await tx.user.delete({ where: { id: target.id } })
        },
        { isolationLevel: 'Serializable' },
      )
      res.status(204).end()
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
      if (err.code === 'LAST_ADMIN') return res.status(400).json({ error: err.message })
      throw err
    }
  } catch (err) {
    next(err)
  }
})

export default router

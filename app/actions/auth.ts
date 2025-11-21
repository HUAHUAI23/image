'use server'

import { and,eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { db } from '@/db'
import { accounts,userIdentities, users } from '@/db/schema'
import { createSession, deleteSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { hashPassword, verifyPassword } from '@/lib/password'

const loginSchema = z.object({
  username: z.string().min(3, '用户名至少需要3个字符'),
  password: z.string().min(6, '密码至少需要6个字符'),
})

export async function loginAction(prevState: any, formData: FormData) {
  const result = loginSchema.safeParse(Object.fromEntries(formData))

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
    }
  }

  const { username, password } = result.data

  try {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
    })

    if (existingUser) {
      // Login flow
      const identity = await db.query.userIdentities.findFirst({
        where: and(
          eq(userIdentities.userId, existingUser.id),
          eq(userIdentities.provider, 'password')
        ),
      })

      if (!identity) {
        return { message: '用户已存在但未设置密码，请使用其他方式登录' }
      }

      // Use type assertion since we know the structure but TS might complain about optional properties access
      const metadata = identity.metadata as { password?: { passwordHash?: string } }
      const isValid = await verifyPassword(password, metadata.password?.passwordHash || '')

      if (!isValid) {
        return { message: '密码错误' }
      }

      await createSession(existingUser.id)
    } else {
      // Register flow
      const passwordHash = await hashPassword(password)

      await db.transaction(async (tx) => {
        const [newUser] = await tx.insert(users).values({ username }).returning()

        await tx.insert(userIdentities).values({
          userId: newUser.id,
          provider: 'password',
          providerUserId: username,
          metadata: { password: { passwordHash } },
          isPrimary: true,
        })

        await tx.insert(accounts).values({
          userId: newUser.id,
          balance: env.GIFT_AMOUNT, // Give some initial balance for testing? Or 0.
        })

        await createSession(newUser.id)
      })
    }
  } catch (error) {
    console.error('Login error:', error)
    return { message: '发生未知错误，请稍后重试' }
  }

  redirect('/')
}

export async function logoutAction() {
  await deleteSession()
  redirect('/login')
}

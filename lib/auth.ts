import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

import { env } from './env'

const secretKey = env.AUTH_SECRET
const key = new TextEncoder().encode(secretKey)

export type SessionPayload = {
  userId: number
  expiresAt: Date
}

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

export async function decrypt(input: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  })
  return payload as SessionPayload
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value
  if (!session) return null
  try {
    return await decrypt(session)
  } catch (_error) {
    return null
  }
}

export async function createSession(userId: number) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ userId, expiresAt })
  const cookieStore = await cookies()

  // In production, only use secure cookies if HTTPS is available
  // For HTTP-only deployments (development/testing), allow insecure cookies
  const isSecure = env.NODE_ENV === 'production' && env.FORCE_HTTPS

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: isSecure,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

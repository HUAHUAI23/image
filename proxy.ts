import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { decrypt } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Verify session
  let verifiedSession = null
  if (session) {
    try {
      verifiedSession = await decrypt(session)
    } catch (_e) {
      // invalid session
    }
  }

  if (isLoginPage && verifiedSession) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!isLoginPage && !verifiedSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)).*)',
  ],
}

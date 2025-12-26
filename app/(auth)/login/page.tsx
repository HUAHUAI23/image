'use client'

import { useActionState, useEffect } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'

import { loginAction } from '@/app/actions/auth'
import { BoxesBackground } from '@/components/ui/boxes-background'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [state, action, isPending] = useActionState(loginAction, null)

  useEffect(() => {
    if (state?.message) {
      toast.error(state.message)
    }
  }, [state])

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        <BoxesBackground />
        {/* Radial gradient mask for center focus */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 0%, transparent 30%, var(--background) 70%)',
          }}
        />
      </div>

      <div className="w-full max-w-[400px] space-y-6 relative z-10">


        <Card className="shadow-xl border bg-card">
          <CardHeader className="flex flex-col items-center justify-center gap-3 pb-6 pt-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl">
              <Image src="/icon.svg" alt="Lumina" width={44} height={44} className="size-9 rounded-lg" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">Lumina</CardTitle>
          </CardHeader>
          <form action={action}>
            <CardContent className="grid gap-5 px-8">
              <div className="grid gap-2">
                <Label htmlFor="username" className="text-sm font-medium">用户名</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="请输入用户名"
                  required
                  minLength={3}
                  className="h-10 bg-muted/30"
                />
                {state?.errors?.username && (
                  <p className="text-xs text-destructive font-medium mt-1">{state.errors.username[0]}</p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">密码</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-10 bg-muted/30"
                />
                {state?.errors?.password && (
                  <p className="text-xs text-destructive font-medium mt-1">{state.errors.password[0]}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-5 px-8 pb-8 pt-4">
              <Button className="w-full font-medium shadow-sm h-10 text-sm" type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登录中...
                  </>
                ) : (
                  <>
                    登录
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <div className="text-xs text-center text-muted-foreground/70 leading-relaxed max-w-[280px] mx-auto">
                登录即代表您同意我们的 <span className="hover:text-foreground hover:underline cursor-pointer transition-colors">服务条款</span> 和 <span className="hover:text-foreground hover:underline cursor-pointer transition-colors">隐私政策</span>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}

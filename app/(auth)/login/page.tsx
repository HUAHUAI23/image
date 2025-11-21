'use client'

import { useActionState } from 'react'
import { useEffect } from 'react'
import { ArrowRight,GalleryVerticalEnd, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { loginAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="flex min-h-screen w-full items-center justify-center p-4 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Background Elements */}
      <div className="absolute inset-0 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>
      <div className="absolute right-0 bottom-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-500/20 opacity-20 blur-[100px]"></div>

      <div className="w-full max-w-sm space-y-6 relative z-10">
        <div className="flex flex-col items-center justify-center gap-2 self-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <GalleryVerticalEnd className="size-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Image Gen Pro</span>
          <p className="text-sm text-muted-foreground">Enterprise Grade AI Generation</p>
        </div>

        <Card className="shadow-2xl border-border/40 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
          <CardHeader className="space-y-1 text-center pb-2">
            <CardTitle className="text-xl font-bold">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <form action={action}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  required
                  minLength={3}
                  className="bg-background/50"
                />
                {state?.errors?.username && (
                  <p className="text-xs text-destructive font-medium">{state.errors.username[0]}</p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="bg-background/50"
                />
                {state?.errors?.password && (
                  <p className="text-xs text-destructive font-medium">{state.errors.password[0]}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button className="w-full font-semibold shadow-md" type="submit" disabled={isPending} size="lg">
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                By clicking continue, you agree to our <span className="underline cursor-pointer hover:text-foreground">Terms of Service</span> and <span className="underline cursor-pointer hover:text-foreground">Privacy Policy</span>.
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}

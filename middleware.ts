import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSessionContext } from '@/lib/isla/context'
import { CONTEXT_COOKIE, buildContextCookie, readCachedContext } from '@/lib/isla/sessionCookie'

// Rutas donde puede estar un vendedor (modo isla)
const SELLER_PATHS = ['/caja', '/reset-password']

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl
    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')
    const isResetPassword = pathname.startsWith('/reset-password')
    const isOnboarding = pathname.startsWith('/onboarding')
    const isApi = pathname.startsWith('/api')
    const isServiceWorker = pathname === '/sw.js' || pathname === '/manifest.json'

    // Skip middleware for API routes and PWA files
    if (isApi || isServiceWorker) return supabaseResponse

    // Recuperar contraseña: accesible con o sin sesión (el enlace del correo inicia sesión)
    if (isResetPassword) return supabaseResponse

    // Not logged in → redirect to login
    if (!user && !isAuthRoute) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Logged in → don't show auth pages
    if (user && isAuthRoute) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    // Logged in — resolve store and role (skip if already on onboarding)
    if (user && !isAuthRoute && !isOnboarding) {
        // Caché de 2 minutos: evita preguntar el rol a la base de datos en cada pantalla
        const cached = await readCachedContext(request.cookies.get(CONTEXT_COOKIE)?.value, user.id)

        let role = cached?.role
        if (!cached) {
            const context = await getSessionContext(supabase)

            if (!context) {
                return NextResponse.redirect(new URL('/onboarding', request.url))
            }

            role = context.role
            const cookie = await buildContextCookie({ userId: user.id, storeId: context.storeId, role: context.role })
            if (cookie) {
                supabaseResponse.cookies.set(cookie.name, cookie.value, {
                    maxAge: cookie.maxAge, httpOnly: true, sameSite: 'lax', path: '/',
                    secure: process.env.NODE_ENV === 'production',
                })
            }
        }

        // Vendedor: solo la caja
        if (role === 'seller' && !SELLER_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
            return NextResponse.redirect(new URL('/caja', request.url))
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}

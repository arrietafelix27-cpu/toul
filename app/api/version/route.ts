/* La versión publicada. La app la consulta cada cierto tiempo: si cambió,
   se actualiza sola en el siguiente cambio de pantalla (ver
   components/ActualizarVersion). En el equipo de desarrollo no hay
   versión y nunca se recarga. */

export const dynamic = 'force-dynamic'

export function GET() {
    return Response.json(
        { version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local' },
        { headers: { 'Cache-Control': 'no-store' } },
    )
}

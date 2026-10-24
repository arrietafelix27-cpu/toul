'use client'
/**
 * PageWrapper — envuelve cada pantalla de la app.
 *
 * Antes le ponía una entrada con desvanecido. Como no se vuelve a montar
 * al cambiar de pantalla, esa animación solo corría en la primera carga,
 * y ahí hacía daño: la pantalla llegaba del servidor invisible (opacidad
 * cero) y se quedaba en blanco hasta que cargaba todo el código. Ahora se
 * muestra de una; cada pantalla ya anima sus propias partes.
 */
export default function PageWrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}

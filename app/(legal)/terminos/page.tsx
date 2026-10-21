import type { Metadata } from 'next'
import Link from 'next/link'
import { TERMINOS_VERSION, TERMINOS_VIGENCIA } from '@/components/auth/AceptarTerminos'

export const metadata: Metadata = {
    title: 'Términos de uso — TOUL',
    description: 'Las condiciones para usar TOUL.',
}

export default function TerminosPage() {
    return (
        <article>
            <h1>Términos de uso</h1>
            <p className="lg-meta">Vigentes desde el {TERMINOS_VIGENCIA} · Versión {TERMINOS_VERSION}</p>

            <div className="lg-ficha">
                <p>
                    Estos términos son el acuerdo entre tú y TOUL para usar la app. Al crear tu cuenta los aceptas.
                    Si no estás de acuerdo, no uses TOUL.
                </p>
            </div>

            <h2>1. Qué es TOUL</h2>
            <p>
                TOUL es una aplicación para administrar negocios que venden por Instagram, WhatsApp y en punto
                físico: inventario, ventas, clientes, cuentas por cobrar, gastos, caja y reportes. La presta
                <strong> Félix Arrieta</strong>, persona natural con domicilio en Barranquilla, Colombia
                (en adelante, &quot;TOUL&quot;).
            </p>

            <h2>2. Tu cuenta</h2>
            <ul>
                <li>Debes ser mayor de edad y dar datos reales.</li>
                <li>Cuidas tu contraseña y respondes por lo que se haga con tu cuenta. Si crees que alguien entró sin permiso, cambia la contraseña y cierra la sesión en todos los equipos desde Ajustes, y escríbenos.</li>
                <li>Si invitas vendedores, tú decides qué hacen y respondes por cómo usan tu negocio en TOUL. Puedes desactivarlos cuando quieras.</li>
            </ul>

            <h2>3. Planes y pagos</h2>
            <p>
                TOUL tiene planes de pago mensual. Antes de cobrarte te mostramos el precio, lo que incluye cada
                plan y cómo cancelar. Si un precio cambia, te avisamos antes de que aplique.
            </p>

            <h2>4. Tu información es tuya</h2>
            <p>
                Lo que registras en TOUL te pertenece. Puedes descargarlo cuando quieras desde
                <strong> Ajustes → Tus datos</strong>. Nos das permiso de guardarlo y procesarlo solo para
                prestarte el servicio. Cómo cuidamos los datos personales está en la{' '}
                <Link href="/privacidad">Política de datos</Link>.
            </p>

            <h2>5. Uso correcto</h2>
            <p>No puedes usar TOUL para:</p>
            <ul>
                <li>Actividades ilegales o vender productos prohibidos por la ley.</li>
                <li>Entrar a cuentas o datos que no son tuyos.</li>
                <li>Copiar, revender, desarmar o atacar la app.</li>
                <li>Registrar información de otras personas sin tener derecho a hacerlo.</li>
            </ul>

            <h2>6. Lo que TOUL es y lo que no es</h2>
            <ul>
                <li>TOUL es una herramienta de registro y control. Las cifras se calculan con lo que tú registras: si un dato está mal, el resultado también.</li>
                <li><strong>TOUL no es un sistema de facturación electrónica de la DIAN</strong> y no reemplaza a tu contador. Las tirillas que imprime la caja no son factura electrónica.</li>
                <li>Tus obligaciones tributarias y contables siguen siendo tuyas.</li>
            </ul>

            <h2>7. Disponibilidad</h2>
            <p>
                Trabajamos para que TOUL funcione siempre, y la caja puede seguir vendiendo sin internet. Aun así
                puede haber fallas o mantenimientos. Cuando planeemos un mantenimiento, intentaremos avisarte antes.
            </p>

            <h2>8. Responsabilidad</h2>
            <p>
                En la medida en que la ley lo permita, TOUL no responde por pérdidas indirectas, ganancias dejadas
                de recibir ni por decisiones de negocio tomadas con la información de la app. Nada de esto limita
                los derechos que la ley colombiana te da como consumidor (Ley 1480 de 2011).
            </p>

            <h2>9. Suspensión y cierre de la cuenta</h2>
            <p>
                Puedes dejar de usar TOUL y pedir que borremos tu cuenta escribiendo a{' '}
                <a href="mailto:hola@toul.app">hola@toul.app</a>. Podemos suspender una cuenta que incumpla estos
                términos o use TOUL para algo ilegal. Salvo casos graves, te avisaremos antes y podrás descargar
                tu información.
            </p>

            <h2>10. Cambios a estos términos</h2>
            <p>
                Si estos términos cambian, te avisamos en la app o por correo antes de que apliquen. Si sigues
                usando TOUL después de esa fecha, aceptas los nuevos.
            </p>

            <h2>11. Ley aplicable</h2>
            <p>Estos términos se rigen por las leyes de Colombia.</p>

            <h2>12. Contacto</h2>
            <p>
                <a href="mailto:hola@toul.app">hola@toul.app</a> · Barranquilla, Colombia.
            </p>
        </article>
    )
}

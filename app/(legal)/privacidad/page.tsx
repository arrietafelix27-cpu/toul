import type { Metadata } from 'next'
import Link from 'next/link'
import { TERMINOS_VERSION, TERMINOS_VIGENCIA } from '@/components/auth/AceptarTerminos'

export const metadata: Metadata = {
    title: 'Política de datos — TOUL',
    description: 'Cómo TOUL trata los datos personales de quienes usan la app y de sus clientes.',
}

export default function PrivacidadPage() {
    return (
        <article>
            <h1>Política de tratamiento de datos personales</h1>
            <p className="lg-meta">Vigente desde el {TERMINOS_VIGENCIA} · Versión {TERMINOS_VERSION}</p>

            <div className="lg-ficha">
                <p>
                    Esta política explica qué datos guarda TOUL, para qué los usa, con quién los comparte y cómo
                    puedes pedir que los corrijamos o los borremos. Cumple la Ley 1581 de 2012 y el Decreto 1074
                    de 2015 de Colombia.
                </p>
            </div>

            <h2>1. Quién es el responsable</h2>
            <ul>
                <li><strong>Félix Arrieta</strong>, persona natural.</li>
                <li>Domicilio: Barranquilla, Atlántico, Colombia.</li>
                <li>Correo: <a href="mailto:hola@toul.app">hola@toul.app</a></li>
                <li>Sitio: toul.app</li>
            </ul>

            <h2>2. Qué datos tratamos</h2>
            <ul>
                <li><strong>De tu cuenta:</strong> tu correo y tu contraseña. La contraseña se guarda cifrada: nadie en TOUL puede verla. Si entras con Google, recibimos el nombre y el correo que Google comparte.</li>
                <li><strong>De tu negocio:</strong> el nombre, los productos, precios, ventas, gastos, compras, turnos de caja y todo lo que registres.</li>
                <li><strong>De tus clientes y proveedores:</strong> nombre, teléfono, lo que compran y lo que deben, cuando decides registrarlos.</li>
                <li><strong>Del uso de la app:</strong> tipo de equipo y navegador, fechas de entrada y fallas técnicas, para que la app funcione y para corregir errores.</li>
            </ul>
            <p>No pedimos datos sensibles (salud, religión, opinión política, huellas o rostro) ni números de tarjeta dentro de la app.</p>

            <h2>3. Para qué los usamos</h2>
            <ul>
                <li>Prestarte el servicio: guardar y mostrar la información de tu negocio, mantener tus equipos al día y permitir vender sin internet.</li>
                <li>Proteger tu cuenta: confirmar tu correo, enviarte códigos de seguridad y detectar entradas extrañas.</li>
                <li>Escribirte sobre tu cuenta, tu plan, cambios del servicio y soporte.</li>
                <li>Cobrar tu plan.</li>
                <li>Mejorar la app con estadísticas de uso que no te identifican.</li>
                <li>Cumplir obligaciones legales y atender a las autoridades cuando la ley lo exija.</li>
            </ul>
            <p><strong>No vendemos tus datos ni los de tus clientes, y no los usamos para publicidad.</strong></p>

            <h2>4. Los datos de tus clientes</h2>
            <p>
                Cuando registras a tus clientes o proveedores, tú eres el responsable de esos datos y TOUL actúa como
                encargado: los guardamos y procesamos solo para prestarte el servicio. Te corresponde informarles
                y contar con su autorización cuando la ley lo pida.
            </p>

            <h2>5. Con quién los compartimos</h2>
            <p>Para funcionar, TOUL usa proveedores de tecnología que procesan datos a nombre nuestro:</p>
            <ul>
                <li><strong>Supabase:</strong> base de datos y manejo de cuentas.</li>
                <li><strong>Vercel:</strong> aloja la app.</li>
                <li><strong>Google:</strong> envío de correos y, si lo eliges, la entrada con Google.</li>
                <li><strong>OpenAI:</strong> el asistente y las sugerencias automáticas reciben resúmenes de la información de tu negocio para responderte.</li>
                <li><strong>Servicios de notificaciones del navegador:</strong> para avisos como las aprobaciones de la caja.</li>
            </ul>
            <p>
                Algunos de estos proveedores guardan datos fuera de Colombia, incluido Estados Unidos. Al aceptar
                esta política autorizas esa transferencia, que hacemos solo con proveedores que ofrecen niveles
                adecuados de protección. También entregaremos datos a una autoridad cuando la ley nos obligue.
            </p>

            <h2>6. Tus derechos</h2>
            <p>Como titular de tus datos puedes:</p>
            <ul>
                <li>Conocer, actualizar y corregir tus datos.</li>
                <li>Pedir prueba de la autorización que nos diste.</li>
                <li>Saber cómo hemos usado tus datos.</li>
                <li>Revocar la autorización o pedir que borremos tus datos, cuando no exista un deber legal de conservarlos.</li>
                <li>Consultar tus datos gratis.</li>
                <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
            </ul>
            <p>Además, en <strong>Ajustes → Tus datos</strong> puedes descargar tu información cuando quieras.</p>

            <h2>7. Cómo ejercerlos</h2>
            <p>
                Escríbenos a <a href="mailto:hola@toul.app">hola@toul.app</a> desde el correo de tu cuenta, con tu
                nombre y lo que necesitas.
            </p>
            <ul>
                <li><strong>Consultas:</strong> respondemos en máximo 10 días hábiles. Si necesitamos más tiempo, te avisamos y respondemos en máximo 5 días hábiles más.</li>
                <li><strong>Reclamos</strong> (corregir, actualizar, borrar o revocar): respondemos en máximo 15 días hábiles. Si necesitamos más tiempo, te avisamos y respondemos en máximo 8 días hábiles más.</li>
            </ul>
            <p>Si no quedas conforme con la respuesta, puedes acudir a la SIC.</p>

            <h2>8. Cómo los protegemos</h2>
            <ul>
                <li>Toda la información viaja cifrada.</li>
                <li>Las contraseñas se guardan cifradas.</li>
                <li>Cada negocio solo ve sus propios datos: la base de datos lo impide para cualquier otro.</li>
                <li>Los vendedores solo ven lo que su rol les permite.</li>
            </ul>

            <h2>9. Cuánto tiempo los guardamos</h2>
            <p>
                Mientras tu cuenta esté activa. Si pides borrar tu cuenta, eliminamos tus datos en máximo 30 días,
                salvo lo que la ley nos obligue a conservar, como los registros de pagos de tu plan.
            </p>

            <h2>10. Cookies y almacenamiento del equipo</h2>
            <p>
                Usamos cookies y el almacenamiento del navegador solo para mantener tu sesión abierta, recordar
                preferencias del equipo y guardar las ventas hechas sin internet hasta que se carguen. No usamos
                cookies de publicidad.
            </p>

            <h2>11. Menores de edad</h2>
            <p>TOUL es para mayores de 18 años. No recolectamos a sabiendas datos de menores.</p>

            <h2>12. Cambios a esta política</h2>
            <p>
                Si cambia algo importante, te avisamos en la app o por correo antes de que aplique. La versión vigente
                siempre está en esta página. Lee también los <Link href="/terminos">Términos de uso</Link>.
            </p>
        </article>
    )
}

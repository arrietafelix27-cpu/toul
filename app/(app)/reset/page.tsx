import { redirect } from 'next/navigation'

// Desactivado: esta pantalla borraba todos los datos del negocio sin protección.
// Se conserva la ruta solo para redirigir a quien tenga el enlace guardado.
export default function ResetStorePage() {
    redirect('/')
}

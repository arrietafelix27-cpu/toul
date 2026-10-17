import { redirect } from 'next/navigation'

// Caja dejó de ser un módulo: era un pasillo de tres botones y su
// nombre prometía un cajón que no todos los negocios tienen. Gastos y
// Movimientos viven en el menú; los métodos de pago, en Ajustes.
export default function CashPage() {
    redirect('/movimientos')
}

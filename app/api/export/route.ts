import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/export?tipo=ventas|productos|clientes|gastos|compras
 *
 * Saca los datos del negocio en un archivo que abre Excel.
 * Sus datos son suyos: tiene que poder llevárselos cuando quiera,
 * y es lo primero que pregunta alguien que va a pagar.
 */

type Fila = Record<string, unknown>

/** Excel en español lee punto y coma, no coma */
const SEP = ';'

function aCSV(filas: Fila[], columnas: { campo: string; titulo: string }[]): string {
    const escapar = (v: unknown) => {
        if (v === null || v === undefined) return ''
        const texto = String(v)
        // Un valor con separador, comillas o salto de línea va entrecomillado
        return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
    }
    const cabecera = columnas.map(c => escapar(c.titulo)).join(SEP)
    const cuerpo = filas.map(f => columnas.map(c => escapar(f[c.campo])).join(SEP))
    // El BOM es lo que hace que Excel respete las tildes
    return '﻿' + [cabecera, ...cuerpo].join('\r\n')
}

const fecha = (iso: unknown) =>
    iso ? new Date(String(iso)).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : ''

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: store } = await supabase.from('stores').select('id, name').eq('owner_id', user.id).single()
    if (!store) return NextResponse.json({ error: 'No encontramos tu tienda' }, { status: 404 })

    const tipo = new URL(request.url).searchParams.get('tipo') ?? 'ventas'
    let csv = ''

    if (tipo === 'ventas') {
        const { data } = await supabase.from('sales')
            .select('id, created_at, total, discount, payment_method, is_credit, customer_name, seller_name')
            .eq('store_id', store.id).order('created_at', { ascending: false }).limit(5000)
        csv = aCSV((data ?? []).map(v => ({
            numero: `#${String(v.id).slice(0, 8).toUpperCase()}`,
            fecha: fecha(v.created_at),
            cliente: v.customer_name ?? '',
            total: Math.round(Number(v.total)),
            descuento: Math.round(Number(v.discount) || 0),
            pago: v.is_credit ? 'Crédito' : (v.payment_method ?? ''),
            vendio: v.seller_name ?? '',
        })), [
            { campo: 'numero', titulo: 'N° de venta' },
            { campo: 'fecha', titulo: 'Fecha' },
            { campo: 'cliente', titulo: 'Cliente' },
            { campo: 'total', titulo: 'Total' },
            { campo: 'descuento', titulo: 'Descuento' },
            { campo: 'pago', titulo: 'Cómo pagó' },
            { campo: 'vendio', titulo: 'Vendió' },
        ])

    } else if (tipo === 'productos') {
        const { data } = await supabase.from('products')
            .select('name, reference, sale_price, cpp, stock, is_active')
            .eq('store_id', store.id).order('name')
        csv = aCSV((data ?? []).map(p => ({
            nombre: p.name,
            referencia: p.reference ?? '',
            precio: Math.round(Number(p.sale_price) || 0),
            costo: Math.round(Number(p.cpp) || 0),
            stock: Number(p.stock) || 0,
            estado: p.is_active ? 'Activo' : 'Escondido',
        })), [
            { campo: 'nombre', titulo: 'Producto' },
            { campo: 'referencia', titulo: 'Referencia' },
            { campo: 'precio', titulo: 'Precio de venta' },
            { campo: 'costo', titulo: 'Costo' },
            { campo: 'stock', titulo: 'Unidades' },
            { campo: 'estado', titulo: 'Estado' },
        ])

    } else if (tipo === 'clientes') {
        const { data } = await supabase.from('customers')
            .select('name, phone, notes, total_debt, created_at')
            .eq('store_id', store.id).order('name')
        csv = aCSV((data ?? []).map(c => ({
            nombre: c.name,
            telefono: c.phone ?? '',
            debe: Math.round(Number(c.total_debt) || 0),
            nota: c.notes ?? '',
            desde: fecha(c.created_at),
        })), [
            { campo: 'nombre', titulo: 'Cliente' },
            { campo: 'telefono', titulo: 'Teléfono' },
            { campo: 'debe', titulo: 'Debe' },
            { campo: 'nota', titulo: 'Nota' },
            { campo: 'desde', titulo: 'Cliente desde' },
        ])

    } else if (tipo === 'gastos') {
        const { data } = await supabase.from('expenses')
            .select('created_at, category, description, amount')
            .eq('store_id', store.id).order('created_at', { ascending: false }).limit(5000)
        csv = aCSV((data ?? []).map(g => ({
            fecha: fecha(g.created_at),
            categoria: g.category,
            detalle: g.description ?? '',
            monto: Math.round(Number(g.amount)),
        })), [
            { campo: 'fecha', titulo: 'Fecha' },
            { campo: 'categoria', titulo: 'Categoría' },
            { campo: 'detalle', titulo: 'En qué' },
            { campo: 'monto', titulo: 'Monto' },
        ])

    } else if (tipo === 'compras') {
        const { data } = await supabase.from('purchases')
            .select('id, created_at, total, is_credit, status, providers(name)')
            .eq('store_id', store.id).order('created_at', { ascending: false }).limit(5000)
        csv = aCSV((data ?? []).map(c => ({
            numero: `#${String(c.id).slice(0, 8).toUpperCase()}`,
            fecha: fecha(c.created_at),
            proveedor: (c.providers as { name?: string } | null)?.name ?? '',
            total: Math.round(Number(c.total)),
            pago: c.is_credit ? 'Crédito' : 'Contado',
            estado: c.status === 'voided' ? 'Anulada' : 'Completada',
        })), [
            { campo: 'numero', titulo: 'N° de compra' },
            { campo: 'fecha', titulo: 'Fecha' },
            { campo: 'proveedor', titulo: 'Proveedor' },
            { campo: 'total', titulo: 'Total' },
            { campo: 'pago', titulo: 'Cómo pagó' },
            { campo: 'estado', titulo: 'Estado' },
        ])

    } else {
        return NextResponse.json({ error: 'No sabemos exportar eso' }, { status: 400 })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    const nombre = `toul-${tipo}-${hoy}.csv`

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${nombre}"`,
            'Cache-Control': 'no-store',
        },
    })
}

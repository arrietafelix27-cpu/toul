import { redirect } from 'next/navigation'

// El producto con presentaciones ya no tiene pantalla aparte:
// vive en el detalle normal del producto.
export default async function VariantGroupPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    redirect(`/products/${id}`)
}

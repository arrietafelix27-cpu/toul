import { redirect } from 'next/navigation'

// El catálogo vive en /products.
export default function InventoryCatalogPage() {
    redirect('/products')
}

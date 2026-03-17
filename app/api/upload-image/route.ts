import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const storeId = formData.get('storeId') as string

    if (!file || !storeId) {
        return NextResponse.json({ error: 'Missing file or storeId' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${storeId}/${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, buffer, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
        })

    if (upErr) {
        console.error('Upload error:', upErr)
        return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

    return NextResponse.json({ url: publicUrl })
}

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ufrfpxpdbxqdmjuzkhgw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcmZweHBkYnhxZG1qdXpraGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzM1NjEsImV4cCI6MjA4ODI0OTU2MX0.tRWjTu4OuvITWi2nwreK6ebj03OByoTCv9fznPI5Wz4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const tables = ['providers', 'purchases', 'purchase_items', 'provider_debts', 'inventory_adjustments']
    for (const table of tables) {
        // Use a generic query that should work if table exists
        const { error } = await supabase.from(table).select('id').limit(1)
        if (error && error.code === '42P01') {
            console.log(`Table ${table}: NOT FOUND`)
        } else if (error) {
            console.log(`Table ${table}: ERROR: ${error.message} (${error.code})`)
        } else {
            console.log(`Table ${table}: OK`)
        }
    }
}

check()

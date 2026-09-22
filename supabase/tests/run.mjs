/**
 * Pruebas de la base de datos de TOUL.
 *
 * Levanta un PostgreSQL real en memoria (PGlite), reproduce todas las
 * migraciones en orden con RLS activo y corre los casos de prueba como si
 * fueran usuarios reales (dueño y vendedora).
 *
 *   npm run test:db
 */
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const SUPABASE_DIR = path.join(TESTS_DIR, '..')

const MIGRATIONS = [
    'schema.sql', 'migration_v2.sql', 'migration_v3.sql', 'migration_v4_appearance.sql',
    'migration_v5.sql', 'migration_v5_hotfix.sql', 'migration_v6.sql', 'migration_v7.sql',
    'migration_v7_hotfix.sql', 'migration_v8.sql', 'migration_v9.sql',
    'deploy_isla.sql', 'deploy_offline_conteo.sql',
]

const SUITES = ['isla.test.mjs', 'offline-conteo.test.mjs']

async function runSuite(file) {
    const db = new PGlite()
    await db.exec(fs.readFileSync(path.join(TESTS_DIR, 'stubs.sql'), 'utf8'))
    for (const migration of MIGRATIONS) {
        await db.exec(fs.readFileSync(path.join(SUPABASE_DIR, migration), 'utf8'))
    }
    // Supabase da estos permisos por defecto al rol `authenticated`; RLS es lo que filtra
    await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;`)

    console.log(`\n═══ ${file} ═══`)
    const suite = await import(path.join(TESTS_DIR, file))
    return suite.default(db)
}

let failed = 0
for (const suite of SUITES) {
    try {
        const result = await runSuite(suite)
        if (result && result.fails) failed += result.fails
    } catch (err) {
        console.error(`✗ ${suite} falló:`, err.message)
        failed++
    }
}

console.log(failed === 0 ? '\n✅ Todas las pruebas pasaron' : `\n❌ ${failed} fallos`)
process.exit(failed === 0 ? 0 : 1)

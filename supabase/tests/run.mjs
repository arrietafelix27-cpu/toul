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
    'deploy_isla.sql', 'deploy_offline_conteo.sql', 'deploy_compras_simples.sql',
    'deploy_catalogo_publico.sql', 'deploy_inventario.sql',
    'deploy_compras_proveedor.sql', 'deploy_precision.sql',
    'deploy_clientes.sql', 'deploy_cartera.sql', 'deploy_compras_detalle.sql', 'deploy_guardado_atomico.sql', 'deploy_deshacer.sql', 'deploy_errores.sql', 'deploy_planes.sql',
    'deploy_devoluciones.sql', 'deploy_reportes.sql', 'deploy_catalogo_stock.sql', 'deploy_caja_segura.sql', 'deploy_caja_permisos.sql',
    'deploy_movimientos.sql', 'deploy_movimientos_cuentas.sql', 'deploy_inventario_cuentas.sql',
    'deploy_inventario_consistencia.sql',
    // Va antes que "Plata mía" solo aquí, para que antes-y-despues siga
    // probando ese cambio: no se tocan entre sí (en Supabase se corrió después)
    'deploy_minimo_exacto.sql',
    'deploy_sin_plata_mia.sql',
]

// Arma todo con lo de antes del último cambio (incluida la tienda de prueba,
// que corre adentro con sus valores de siempre), toma la foto de los números,
// aplica el último SQL de la lista y revisa que la foto salga idéntica
const ANTES_Y_DESPUES = 'antes-y-despues.test.mjs'

const SUITES = ['isla.test.mjs', 'offline-conteo.test.mjs', 'catalogo-publico.test.mjs', 'inventario.test.mjs', 'compras-proveedor.test.mjs', 'precision.test.mjs', 'clientes.test.mjs', 'cartera.test.mjs', 'compras-detalle.test.mjs', 'guardado-atomico.test.mjs', 'deshacer.test.mjs', 'errores.test.mjs', 'devoluciones.test.mjs', 'reportes.test.mjs', ANTES_Y_DESPUES, 'caja-segura.test.mjs', 'caja-permisos.test.mjs', 'movimientos.test.mjs', 'inventario-cuentas.test.mjs']

async function runSuite(file) {
    const db = new PGlite()
    await db.exec(fs.readFileSync(path.join(TESTS_DIR, 'stubs.sql'), 'utf8'))
    const ultimo = MIGRATIONS[MIGRATIONS.length - 1]
    const migraciones = file === ANTES_Y_DESPUES ? MIGRATIONS.slice(0, -1) : MIGRATIONS
    for (const migration of migraciones) {
        await db.exec(fs.readFileSync(path.join(SUPABASE_DIR, migration), 'utf8'))
    }
    // Supabase da estos permisos por defecto al rol `authenticated`; RLS es lo que filtra
    await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;`)

    console.log(`\n═══ ${file} ═══`)
    const suite = await import(path.join(TESTS_DIR, file))
    return suite.default(db, {
        aplicarCambio: () => db.exec(fs.readFileSync(path.join(SUPABASE_DIR, ultimo), 'utf8')),
    })
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

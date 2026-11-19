// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cabeUnaMas, cuantasCaben, demandaDeCarrito, demandaDeVentasGuardadas, loQueFalta, stockRestante, unidadesDeLinea, type ComboConComponentes } from './stock.ts'

// Dúo: un Sauvage suelto + un Bleu de 50ml
const combos: ComboConComponentes[] = [
    { id: 'duo', combo_items: [{ product_id: 'sauvage', variant_id: null, quantity: 1 }, { product_id: null, variant_id: 'b50', quantity: 1 }] },
    { id: 'doble', combo_items: [{ product_id: 'sauvage', variant_id: null, quantity: 2 }] },
    { id: 'vacio', combo_items: [] },
]
const stock = { 'p:sauvage': 3, 'v:b50': 1, 'v:b100': 4 }

test('Cada línea del carrito se cuenta en unidades de inventario', () => {
    assert.deepEqual(unidadesDeLinea('sauvage', combos), { 'p:sauvage': 1 })
    assert.deepEqual(unidadesDeLinea('bleu:b100', combos), { 'v:b100': 1 })
    assert.deepEqual(unidadesDeLinea('combo:duo', combos), { 'p:sauvage': 1, 'v:b50': 1 })
    assert.deepEqual(unidadesDeLinea('combo:no-existe', combos), {})
})

test('Un perfume suelto y el mismo perfume dentro de un combo comparten el stock', () => {
    const carrito = { sauvage: 2, 'combo:duo': 1 }
    assert.deepEqual(demandaDeCarrito(carrito, combos), { 'p:sauvage': 3, 'v:b50': 1 })
    // Con 3 Sauvage en total ya no cabe ni uno suelto ni otro combo
    assert.equal(cabeUnaMas('sauvage', carrito, combos, stock), false)
    assert.equal(loQueFalta('combo:duo', carrito, combos, stock), 'p:sauvage')
    assert.equal(cabeUnaMas('bleu:b100', carrito, combos, stock), true)
})

test('Al combo le falta lo que no alcanza, aunque el carrito esté vacío', () => {
    assert.equal(loQueFalta('combo:duo', {}, combos, { 'p:sauvage': 3, 'v:b50': 0 }), 'v:b50')
    assert.equal(loQueFalta('combo:doble', {}, combos, { 'p:sauvage': 1 }), 'p:sauvage')
    assert.equal(loQueFalta('combo:doble', {}, combos, { 'p:sauvage': 2 }), null)
    // Un combo sin productos no pide nada
    assert.equal(cabeUnaMas('combo:vacio', {}, combos, {}), true)
})

test('Sin stock no cabe nada; lo que no se conoce cuenta como cero', () => {
    assert.equal(cabeUnaMas('eros', {}, combos, stock), false)
    assert.equal(cabeUnaMas('sauvage', { sauvage: 3 }, combos, stock), false)
    assert.equal(cabeUnaMas('sauvage', { sauvage: 2 }, combos, stock), true)
})

test('Las ventas guardadas sin internet descuentan su stock en el equipo', () => {
    const ventas = [
        { body: { cart: [{ product: { id: 'sauvage' }, quantity: 1 }, { product: { id: 'bleu' }, variantId: 'b100', quantity: 2 }] } },
        { body: { cart: [{ product: { id: 'duo' }, isCombo: true, comboId: 'duo', quantity: 1 }] } },
        // Basura que no debe romper ni contar
        { body: { cart: [{ product: { id: 'sauvage' }, quantity: -4 }, { quantity: 1 }] } },
        { body: {} },
    ]
    const guardado = demandaDeVentasGuardadas(ventas, combos)
    assert.deepEqual(guardado, { 'p:sauvage': 2, 'v:b100': 2, 'v:b50': 1 })
    assert.deepEqual(stockRestante(stock, guardado), { 'p:sauvage': 1, 'v:b50': 0, 'v:b100': 2 })
})

test('El stock que queda nunca es negativo', () => {
    assert.deepEqual(stockRestante({ 'p:a': 1 }, { 'p:a': 5, 'p:b': 2 }), { 'p:a': 0, 'p:b': 0 })
})

test('Escribir la cantidad: nunca más de lo que hay, contando las otras líneas', () => {
    // Sauvage tiene 3; el combo dúo lleva 1 Sauvage y 1 Bleu 50
    assert.equal(cuantasCaben('sauvage', {}, combos, stock), 3)
    assert.equal(cuantasCaben('sauvage', { sauvage: 1 }, combos, stock), 3)
    assert.equal(cuantasCaben('sauvage', { 'combo:duo': 1 }, combos, stock), 2)
    assert.equal(cuantasCaben('combo:doble', {}, combos, { 'p:sauvage': 5 }), 2)
    assert.equal(cuantasCaben('eros', {}, combos, stock), 0)
    assert.equal(cuantasCaben('combo:vacio', {}, combos, {}), null)
    // Lo que da coincide con agregar de a uno
    for (const llave of ['sauvage', 'bleu:b100', 'combo:duo']) {
        let carrito: Record<string, number> = { 'combo:duo': 1 }
        if (llave === 'combo:duo') carrito = { sauvage: 1 }
        let n = carrito[llave] ?? 0
        while (cabeUnaMas(llave, { ...carrito, [llave]: n }, combos, stock)) n++
        assert.equal(cuantasCaben(llave, carrito, combos, stock), n)
    }
})


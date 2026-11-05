// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarClientes, clienteConTelefono, mismoTelefono, pareceTelefono } from './clientes.ts'

const clientes = [
    { id: '1', name: 'Carla Ríos', phone: '300 123 4567' },
    { id: '2', name: 'Ana María Gómez', phone: '+57 310 555 0101' },
    { id: '3', name: 'Mariana', phone: null },
    { id: '4', name: 'Juan Carlos', phone: '3209998877' },
]

test('Se busca por nombre sin importar tildes ni mayúsculas', () => {
    assert.deepEqual(buscarClientes(clientes, 'carla rios').map(c => c.id), ['1'])
    assert.deepEqual(buscarClientes(clientes, 'GÓMEZ').map(c => c.id), ['2'])
})

test('Primero los que empiezan así', () => {
    // "Mariana" empieza por "mar"; "Ana María" lo tiene en la segunda palabra
    assert.deepEqual(buscarClientes(clientes, 'mar').map(c => c.id), ['3', '2'])
    assert.deepEqual(buscarClientes(clientes, 'carl').map(c => c.id), ['1', '4'])
})

test('Se busca por teléfono, con o sin espacios', () => {
    assert.deepEqual(buscarClientes(clientes, '3001234').map(c => c.id), ['1'])
    assert.deepEqual(buscarClientes(clientes, '310 555').map(c => c.id), ['2'])
    assert.deepEqual(buscarClientes(clientes, '55').map(c => c.id), [], 'dos dígitos no bastan')
    assert.deepEqual(buscarClientes(clientes, '  '), [])
})

test('El mismo teléfono con o sin el +57 es la misma persona', () => {
    assert.equal(mismoTelefono('3105550101', '+57 310 555 0101'), true)
    assert.equal(mismoTelefono('300-123-4567', '3001234567'), true)
    assert.equal(mismoTelefono('3001234567', '3001234568'), false)
    assert.equal(mismoTelefono('', ''), false, 'sin teléfono no hay coincidencia')
    assert.equal(mismoTelefono('123', '123'), false, 'un número cortico no identifica a nadie')
    assert.equal(clienteConTelefono(clientes, '573209998877')?.id, '4')
    assert.equal(clienteConTelefono(clientes, '3150000000'), undefined)
})

test('Se reconoce cuando lo escrito es un teléfono', () => {
    assert.equal(pareceTelefono('300 123'), true)
    assert.equal(pareceTelefono('+57 300'), true)
    assert.equal(pareceTelefono('Carla 300'), false)
    assert.equal(pareceTelefono('30'), false)
})

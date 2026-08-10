import assert from 'node:assert/strict';
import test from 'node:test';

import { employeeListForActor } from '../api/auth/employees.js';

const rows = [
  {
    id: 'admin', nombre: 'Admin', area: 'Administración', puesto: 'Administrador',
    rol: 'admin', estado: 'Activo', email: 'admin@example.test', coste: 50,
    pin: '123456', responsable: 1, validador: 1
  },
  {
    id: 'sala', nombre: 'Sala', area: 'Sala', puesto: 'Camarera',
    rol: 'empleado', estado: 'Activo', email: 'sala@example.test', coste: 20,
    pin: '654321', responsable: 0, validador: 0
  },
  {
    id: 'cocina', nombre: 'Cocina', area: 'Cocina', puesto: 'Cocinero',
    rol: 'empleado', estado: 'Baja', email: 'cocina@example.test', coste: 19,
    pin: '908172', responsable: 0, validador: 0
  }
];

test('ordinary employees receive only active directory fields and their own email', () => {
  const result = employeeListForActor(rows, rows[1]);
  assert.deepEqual(result.map(row => row.id), ['admin', 'sala']);
  assert.equal(result.find(row => row.id === 'admin').email, undefined);
  assert.equal(result.find(row => row.id === 'admin').coste, undefined);
  assert.equal(result.find(row => row.id === 'sala').email, 'sala@example.test');
  assert.equal(result.some(row => 'pin' in row), false);
});

test('admin sees all operational employee fields but never legacy PINs', () => {
  const result = employeeListForActor(rows, rows[0]);
  assert.equal(result.length, 3);
  assert.equal(result[1].email, 'sala@example.test');
  assert.equal(result[1].coste, 20);
  assert.equal(result.some(row => 'pin' in row), false);
});

test('department supervisors see sensitive fields only inside their scope', () => {
  const boss = {
    id: 'boss', nombre: 'Jefe Sala', area: 'Sala', puesto: 'Jefe de Sala',
    rol: 'jefe', estado: 'Activo'
  };
  const result = employeeListForActor(rows, boss);
  assert.equal(result.find(row => row.id === 'sala').email, 'sala@example.test');
  assert.equal(result.find(row => row.id === 'admin').email, undefined);
  assert.equal(result.some(row => 'pin' in row), false);
});

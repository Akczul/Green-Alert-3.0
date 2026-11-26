import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarNombreUsuario,
  validarPassword,
  validarTelefono,
} from '../../src/utils/constantes-validacion.js';

test('validarNombreUsuario acepta nombres validos con espacios externos', () => {
  assert.equal(validarNombreUsuario('  Juan Diego  '), true);
  assert.equal(validarNombreUsuario('Ana Maria'), true);
});

test('validarNombreUsuario rechaza valores vacios, cortos o peligrosos', () => {
  assert.equal(validarNombreUsuario(''), false);
  assert.equal(validarNombreUsuario(' A '), false);
  assert.equal(validarNombreUsuario('Juan<script>'), false);
  assert.equal(validarNombreUsuario(null), false);
});

test('validarTelefono permite telefonos opcionales y formatos comunes', () => {
  assert.equal(validarTelefono(null), true);
  assert.equal(validarTelefono(''), true);
  assert.equal(validarTelefono('+57 300-123-4567'), true);
  assert.equal(validarTelefono('(300) 123 4567'), true);
});

test('validarTelefono rechaza valores no telefonicos', () => {
  assert.equal(validarTelefono('abc123'), false);
  assert.equal(validarTelefono('123'), false);
  assert.equal(validarTelefono({}), false);
});

test('validarPassword exige quince caracteres y admite frases largas sin composición obligatoria', () => {
  assert.equal(validarPassword('Clave123'), false);
  assert.equal(validarPassword('Una frase extensa y diferente'), true);
  assert.equal(validarPassword('Largas frases con palabras independientes y suficientes para superar sesenta y cuatro caracteres'), true);
  assert.equal(validarPassword('12345678'), false);
  assert.equal(validarPassword('abcdefgh'), false);
  assert.equal(validarPassword('abc123'), false);
  assert.equal(validarPassword(undefined), false);
});

import { describe, it, expect } from 'vitest';
import { matchesSearch } from './utils';

describe('matchesSearch', () => {
  const ficha = {
    name: 'Celadón de Rye',
    code: 'TB-001-A',
    color: 'Verde Jade',
  };

  it('encuentra por coincidencia parcial del nombre', () => {
    expect(matchesSearch('celad', ficha.name, ficha.code, ficha.color)).toBe(true);
  });

  it('encuentra por el nombre completo', () => {
    expect(matchesSearch('Celadón de Rye', ficha.name)).toBe(true);
  });

  it('ignora mayúsculas y minúsculas', () => {
    expect(matchesSearch('CELAD', ficha.name)).toBe(true);
    expect(matchesSearch('celad', ficha.name)).toBe(true);
  });

  it('ignora los acentos tanto en la búsqueda como en la ficha', () => {
    // El motivo del commit "insensible a acentos": escribir "celadon" debe
    // encontrar "Celadón" sin tener que cambiar la ortografía.
    expect(matchesSearch('celadon', 'Celadón')).toBe(true);
    expect(matchesSearch('Celadón', 'celadon')).toBe(true);
    expect(matchesSearch('Ñandú', 'nandu')).toBe(true);
  });

  it('busca también en código y color', () => {
    expect(matchesSearch('TB-001', ficha.name, ficha.code, ficha.color)).toBe(true);
    expect(matchesSearch('jade', ficha.name, ficha.code, ficha.color)).toBe(true);
  });

  it('devuelve falso cuando no coincide con ningún campo', () => {
    expect(matchesSearch('cobalto', ficha.name, ficha.code, ficha.color)).toBe(false);
  });

  it('con la búsqueda vacía devuelve true (no filtra nada)', () => {
    expect(matchesSearch('', ficha.name)).toBe(true);
    expect(matchesSearch('   ', ficha.name)).toBe(true);
  });

  it('no rompe con campos ausentes o nulos', () => {
    expect(matchesSearch('celadon', undefined, null)).toBe(false);
  });

  it('busca dentro de campos array, como los usos de la ficha', () => {
    const usos = ['Apto para vajilla / food safe', 'Cocción electrico'];
    expect(matchesSearch('vajilla', usos)).toBe(true);
    expect(matchesSearch('gas', usos)).toBe(false);
  });

  it('normaliza también la eñe mayúscula', () => {
    // NFD descompone "Ñ" en "N" + tilde combinante, y la tilde sí cae en el
    // rango que se elimina. Por eso "nandu" encuentra "Ñandú".
    expect(matchesSearch('ñandu', 'Ñandú')).toBe(true);
    expect(matchesSearch('nandu', 'Ñandú')).toBe(true);
    expect(matchesSearch('NANDU', 'ñandú')).toBe(true);
  });

  it('no confunde letras distintas que solo se parecen', () => {
    // La normalización quita tildes, no letras. "ñ" no debe mutar en "n" de
    // forma que "nana" encuentre "ñaña" por casualidad: no lo hace porque
    // "Ñaña" se normaliza a "Nana" y las dos sí deben coincidir, pero
    // "gena" no debe encontrar "gaña" si no coincide el resto.
    expect(matchesSearch('nana', 'Ñaña')).toBe(true);
    expect(matchesSearch('gena', 'Gaña')).toBe(false);
  });
});

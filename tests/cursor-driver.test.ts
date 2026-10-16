import { describe, it, expect, vi } from 'vitest';
import { NullCursorDriver, createCursorDriver } from '../src/main/cursor-driver';

describe('CursorDriver System', () => {
  it('NullCursorDriver debe inicializar y responder a llamadas sin errores', async () => {
    const driver = new NullCursorDriver();
    await expect(driver.init()).resolves.toBeUndefined();

    // Las llamadas deben ejecutarse de forma segura sin excepciones
    expect(() => {
      driver.move(100, 200);
      driver.down('left');
      driver.up('left');
      driver.click('left');
      driver.destroy();
    }).not.toThrow();
  });

  it('createCursorDriver debe retornar un CursorDriver válido acorde a la plataforma', () => {
    const driver = createCursorDriver();
    expect(driver).toBeDefined();
    expect(typeof driver.move).toBe('function');
    expect(typeof driver.down).toBe('function');
    expect(typeof driver.up).toBe('function');
    expect(typeof driver.click).toBe('function');
  });
});

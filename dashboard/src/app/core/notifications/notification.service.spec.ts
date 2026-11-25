import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NotificationService } from './notification.service.js';

describe('NotificationService', () => {
  test('adds and dismisses notifications', () => {
    const service = new NotificationService();
    assert.strictEqual(service.notifications().length, 0);

    service.success('Operação concluída', 0);
    assert.strictEqual(service.notifications().length, 1);
    assert.strictEqual(service.notifications()[0].message, 'Operação concluída');
    assert.strictEqual(service.notifications()[0].type, 'success');

    const id = service.notifications()[0].id;
    service.dismiss(id);
    assert.strictEqual(service.notifications().length, 0);
  });

  test('supports warning and error types', () => {
    const service = new NotificationService();
    service.warning('Aviso de cota', 0);
    service.error('Falha de rede', 0);

    assert.strictEqual(service.notifications().length, 2);
    assert.strictEqual(service.notifications()[0].type, 'warning');
    assert.strictEqual(service.notifications()[1].type, 'error');
  });
});

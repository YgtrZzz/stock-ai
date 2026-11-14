import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyBurnRate,
  computeItemRunoutForecast,
  computeAbcCurve,
  sanitizeForecastInput,
} from '../utils/inventoryForecast.js';

describe('Cycle 13 — Inventory Runout Forecaster & ABC Curve Analytics (TDD)', () => {
  it('calculates daily burn rate accurately within specified time window', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const movements = [
      // Item 10: 3 saídas de -10, -5, -15 nos últimos 10 dias (total = 30 em 30 dias -> 1.0 un/dia)
      { item_id: 10, delta: -10, created_at: '2026-11-10T10:00:00Z' },
      { item_id: 10, delta: -5, created_at: '2026-11-05T10:00:00Z' },
      { item_id: 10, delta: -15, created_at: '2026-10-25T10:00:00Z' },
      // Entrada (delta > 0) não conta como consumo/burn rate
      { item_id: 10, delta: 50, created_at: '2026-11-02T10:00:00Z' },
      // Movimentação fora da janela de 30 dias (> 30 dias atrás) deve ser ignorada
      { item_id: 10, delta: -100, created_at: '2026-09-01T10:00:00Z' },

      // Item 20: 1 saída de -60 un nos últimos 30 dias -> 2.0 un/dia
      { item_id: 20, delta: -60, created_at: '2026-11-12T10:00:00Z' },
    ];

    const burnRates = computeDailyBurnRate(movements, 30, now);
    assert.equal(burnRates[10], 1);
    assert.equal(burnRates[20], 2);
    assert.equal(burnRates[999] || 0, 0);
  });

  it('determines runout forecast, urgency statuses (critical, attention, healthy, dormant) and suggested reorders', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const items = [
      { id: 1, name: 'Café Grão 1kg', quantity: 0, min_quantity: 5 },
      { id: 2, name: 'Açúcar Cristal 5kg', quantity: 2, min_quantity: 3 }, // burn = 1/dia -> 2 dias restantes (crítico <= 3)
      { id: 3, name: 'Copo Descartável', quantity: 10, min_quantity: 5 }, // burn = 2/dia -> 5 dias restantes (atenção <= 7)
      { id: 4, name: 'Guardanapo', quantity: 50, min_quantity: 10 }, // burn = 1/dia -> 50 dias restantes (saudável > 7)
      { id: 5, name: 'Chá Especial', quantity: 15, min_quantity: 2 }, // burn = 0 -> parado (dormant)
    ];

    const movements = [
      // Item 2: 30 saídas em 30 dias -> 1.0/dia
      { item_id: 2, delta: -30, created_at: '2026-11-01T10:00:00Z' },
      // Item 3: 60 saídas em 30 dias -> 2.0/dia
      { item_id: 3, delta: -60, created_at: '2026-11-01T10:00:00Z' },
      // Item 4: 30 saídas em 30 dias -> 1.0/dia
      { item_id: 4, delta: -30, created_at: '2026-11-01T10:00:00Z' },
    ];

    const forecast = computeItemRunoutForecast(items, movements, {
      windowDays: 30,
      targetCoverageDays: 15,
      now,
    });

    const item1 = forecast.find((f) => f.id === 1);
    const item2 = forecast.find((f) => f.id === 2);
    const item3 = forecast.find((f) => f.id === 3);
    const item4 = forecast.find((f) => f.id === 4);
    const item5 = forecast.find((f) => f.id === 5);

    assert.equal(item1.urgencyStatus, 'out_of_stock');
    assert.equal(item1.daysRemaining, 0);
    assert.equal(item1.suggestedRestockQty, 5); // Fallback para min_quantity

    assert.equal(item2.urgencyStatus, 'critical');
    assert.equal(item2.daysRemaining, 2);
    // target 15 dias * 1.0 - 2 un atuais = 13 un a comprar
    assert.equal(item2.suggestedRestockQty, 13);

    assert.equal(item3.urgencyStatus, 'attention');
    assert.equal(item3.daysRemaining, 5);
    // target 15 dias * 2.0 - 10 un atuais = 20 un a comprar
    assert.equal(item3.suggestedRestockQty, 20);

    assert.equal(item4.urgencyStatus, 'healthy');
    assert.equal(item4.daysRemaining, 50);
    assert.equal(item4.suggestedRestockQty, 0); // Estoque cobre bem além de 15 dias

    assert.equal(item5.urgencyStatus, 'dormant');
    assert.equal(item5.daysRemaining, Infinity);
    assert.equal(item5.suggestedRestockQty, 0);
  });

  it('classifies inventory accurately into ABC Curve classes based on consumption volume (Pareto)', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const items = [
      { id: 1, name: 'Item Alta Saída' },
      { id: 2, name: 'Item Média Saída' },
      { id: 3, name: 'Item Baixa Saída' },
      { id: 4, name: 'Item Sem Saída' },
    ];

    const movements = [
      // Total saídas = 100
      // Item 1: 70 un (70% do volume -> Classe A)
      { item_id: 1, delta: -70, created_at: '2026-11-10T10:00:00Z' },
      // Item 2: 20 un (acumulado 90% -> Classe B)
      { item_id: 2, delta: -20, created_at: '2026-11-10T10:00:00Z' },
      // Item 3: 10 un (acumulado 100% -> Classe C)
      { item_id: 3, delta: -10, created_at: '2026-11-10T10:00:00Z' },
    ];

    const abc = computeAbcCurve(items, movements, 30, now);
    assert.equal(abc.classes[1], 'A');
    assert.equal(abc.classes[2], 'B');
    assert.equal(abc.classes[3], 'C');
    assert.equal(abc.classes[4], 'C');
    assert.equal(abc.summary.classACount, 1);
    assert.equal(abc.summary.classBCount, 1);
    assert.equal(abc.summary.classCCount, 2);
  });

  it('sanitizes input against prototype pollution, NaN quantities, and invalid dates', () => {
    const malformed = JSON.parse(
      '{"__proto__": {"isAdmin": true}, "items": [{"id": "abc", "quantity": "invalid"}]}'
    );
    const safe = sanitizeForecastInput(malformed);
    assert.equal(Object.prototype.isAdmin, undefined);
    assert.deepEqual(safe, []);
  });
});

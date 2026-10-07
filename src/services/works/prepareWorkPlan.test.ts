import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, degrees } from 'pdf-lib';
import { prepareWorkPlan } from './prepareWorkPlan';

test('planta independente preserva geometria de página rotacionada', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 400]).setRotation(degrees(90));
  const file = new File([new Uint8Array(await pdf.save())], 'planta.pdf', { type: 'application/pdf' });
  const result = await prepareWorkPlan(file);
  assert.equal(result.numPages, 1);
  assert.deepEqual(result.geometry.page, { width: 400, height: 200, rotation: 90 });
  assert.equal(result.geometry.frame.width, 6000);
  assert.equal(result.geometry.frame.height, 3000);
});

test('não aceita arquivo renomeado como PDF, extensão errada, vazio ou acima do limite', async () => {
  await assert.rejects(prepareWorkPlan(new File(['not a pdf'], 'falso.pdf')), /PDF inválido/);
  await assert.rejects(prepareWorkPlan(new File(['not a pdf'], 'falso.jpg')), /em PDF/);
  await assert.rejects(prepareWorkPlan(new File([], 'vazio.pdf')), /vazia/);
  await assert.rejects(prepareWorkPlan(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'grande.pdf')), /8 MB/);
});

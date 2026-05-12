import { listMinutasSchema } from './src/modules/minutas/zod';

const q1 = {
  page: '1', limit: '10', sort: '[{"createdAt":"desc"}]', lineaDefault: 'CUADRA'
};
const result1 = listMinutasSchema.safeParse({ query: q1 });
console.log(JSON.stringify(result1, null, 2));

const q2 = {
  page: '1', limit: '10', sort: '[{"createdAt":"desc"}]', estado: 'EN_REVISION', lineaDefault: 'VESTIGIO', fechaDesde: '2026-05-12T06:00:00.000Z'
};
const result2 = listMinutasSchema.safeParse({ query: q2 });
console.log(JSON.stringify(result2, null, 2));

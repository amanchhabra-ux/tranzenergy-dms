// Issue a CRS in the AEL contractual template with buildIssuedCrs (src/utils/crs.js), then check
// the cells the template fixes are about. Run from the repo root:
//   node tests/test_issue_with_AEL_template.mjs ["<template.xlsx>"] ["<output.xlsx>"]
// Defaults: the TE-002 AEL template, and issued_fixed.xlsx in the system temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { buildIssuedCrs, parseCrsRows, loadWorkbookRows } from '../src/utils/crs.js';

const TEMPLATE = process.argv[2] || 'C:/Users/Jacopo Licheri/Documents/Lavoro/Tranzenergy IN/Offers/TE-002 OE RPCL Madarganj/Templates/CRS template AEL clean.xlsx';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'issued_fixed.xlsx');

const tpl = fs.readFileSync(TEMPLATE);
const dataUri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + tpl.toString('base64');
// what the app sees in the template
const rows = await loadWorkbookRows(new Uint8Array(tpl));
const p = parseCrsRows(rows);
console.log('META found in template:', JSON.stringify(p.meta));
console.log('TABLE layout:', JSON.stringify(p.layout));
const drawing = {
  code: 'RPCL100MW-ARIPL-PVP-ELE-DTS-021', title: 'Fire detection and alarm system GA and datasheets',
  currentVersion: 'R01', review: { proposedCategory: '3' }, contractor: 'ARIPL', consultant: 'AEL',
  pins: [
    { id: 'p1', label: 1, page: 3, comments: [{ text: 'Pin comment one: detector spacing to be shown.', author: 'Kiran', date: '2026-09-23T10:00:00Z' }] },
    { id: 'p2', label: 2, page: 7, comments: [{ text: 'Pin comment two: extinguisher tags do not match LYO-008.', author: 'TE-JL', date: '2026-09-23T11:00:00Z' }, { text: 'ARIPL reply to pin two', author: 'ARIPL' }] },
  ],
  crsImported: [
    { row: 5, sno: '1', comment: 'Uploaded CRS comment A', commentBy: 'AEL', status: 'Open' },
    { row: 6, sno: '2', comment: 'Uploaded CRS comment B', commentBy: 'AEL', status: 'Open' },
    { local: true, id: 'l1', comment: 'Comment added in the CRS panel', commentBy: 'TE-JL', date: '2026-09-24' },
  ],
};
const project = { name: 'RPCL Madarganj 100 MW', workflow: { issueNotation: 'AEL', categoryFormat: 'Category-{key}', crsTemplate: { url: dataUri }, clientName: 'RPCL', consultantName: 'AEL' } };
// same conversion as issueToConsultant in src/AppContext.jsx
const asLocal = (c) => (c.local ? c : { ...c, local: true, id: c.id || ('crs' + c.row), row: undefined, sno: undefined });
const published = { ...drawing, crsImported: drawing.crsImported.map(asLocal), crsRowMap: {} };
const out = await buildIssuedCrs(published, project);
fs.writeFileSync(OUT, out.bytes);
console.log('fileName:', out.fileName, 'rowMap:', JSON.stringify(out.rowMap));
console.log('written:', OUT);

// ── Check the issued sheet ──────────────────────────────────────────────────
const book = new ExcelJS.Workbook();
await book.xlsx.load(out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength));
const ws = book.worksheets[0];
const v = (ref) => ws.getCell(ref).value;
const today = new Date().toISOString().slice(0, 10);
const checks = [
  ['C2 = document number', v('C2'), drawing.code],
  ['H2 = document title', v('H2'), drawing.title],
  ['C3 = review status', v('C3'), 'Category-3'],
  ['B6 = reviewer notation', v('B6'), 'AEL'],
  ['E6 = reviewed revision', v('E6'), 'R01'],
];
for (const [what, got, want] of checks) { assert.equal(got, want, what); console.log(`  ok - ${what}: ${JSON.stringify(got)}`); }
const i6 = v('I6');
assert.ok(i6 instanceof Date, 'I6 is a real date'); assert.equal(i6.toISOString().slice(0, 10), today);
console.log(`  ok - I6 = owner review date, a real date: ${i6.toISOString().slice(0, 10)} (format ${ws.getCell('I6').numFmt || 'template default'})`);
const n = Object.keys(out.rowMap).length;
for (let r = 6; r < 6 + n; r++) assert.equal(ws.getCell(`B${r}`).value, 'AEL', `B${r}`);
console.log(`  ok - all ${n} rows carry AEL in Reviewer/s`);
const wbXml = await (await JSZip.loadAsync(out.bytes)).file('xl/workbook.xml').async('string');
assert.match(wbXml, /fullCalcOnLoad="1"/); console.log('  ok - full recalculation on load (F3, C4 formulas)');
const dv = Object.values(ws.dataValidations?.model || {}).filter(d => d.type === 'list');
assert.ok(dv.length > 0); console.log(`  ok - ${dv.length} list validation(s) restored (Review Status dropdown)`);
console.log('All CRS template checks passed.');

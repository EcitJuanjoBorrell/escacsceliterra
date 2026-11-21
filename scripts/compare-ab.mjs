#!/usr/bin/env node
'use strict';

import fs from 'node:fs';

const paths = process.argv.slice(2);
if (paths.length < 2) {
  console.error('Ús: node scripts/compare-ab.mjs report-A.json [report-B.json ...]');
  process.exit(1);
}

const reports = paths.map(file => {
  if (!fs.existsSync(file)) {
    console.error(`no existeix el report: ${file}`);
    process.exit(1);
  }
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
});

const metricNames = [
  'avgPly', 'medianPly', 'pctDecisive', 'pctDraw', 'pctMate', 'pctAdjudicated',
  'avgUniquePositions', 'avgCaptures', 'avgPromotions', 'avgChecks',
  'avgKingVertMoves', 'totalKingVertCaptures', 'avgKingCelEntries', 'errors'
];

const base = reports.find(report =>
  report.data.meta?.variant === 'A' ||
  report.file.toLowerCase().includes('ab-a-') ||
  report.file.toLowerCase().includes('ab-a-'));
const baseline = base ? base.data.summary : reports[0].data.summary;

function label(report) {
  return report.data.meta?.variant || report.file;
}
function format(value) {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
}
function isPercent(metric) {
  return metric.startsWith('pct');
}

console.log('Variant\t' + metricNames.join('\t') + '\tfitxer');
for (const report of reports) {
  const summary = report.data.summary || {};
  const cells = metricNames.map(metric => {
    const value = summary[metric];
    if (!Number.isFinite(value)) return '-';
    if (report === base || baseline === summary) return format(value);
    const delta = value - baseline[metric];
    const unit = isPercent(metric) ? ' pp' : '';
    return `${format(value)} (${delta >= 0 ? '+' : ''}${format(delta)}${unit})`;
  });
  console.log(`${label(report)}\t${cells.join('\t')}\t${report.file}`);
}

console.log('\nBase: ' + (base ? label(base) : label(reports[0])));

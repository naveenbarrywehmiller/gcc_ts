const ExcelJS = require('exceljs');
const crypto = require('node:crypto');
const path = require('node:path');
const { jwtSecret } = require('../config/env');
const { fail } = require('./projectFields');

const manifestName = '_Import Manifest';
const projectColumns = [
  ...require('./projectFields').columns, ['platform_name', 'Platform'], ['id', 'Project ID'],
  ['active', 'Active'], ['user_assignment_mode', 'User Assignment'], ['user_ids', 'User IDs'],
];
const taskColumns = [
  ['id', 'Task ID'], ['classification', 'Classification'], ['task_category', 'Task Name/Number'],
  ['task_description', 'Description'], ['ownership_id', 'Ownership Details'], ['estimated_hours', 'Estimated Hours'],
  ['input_received_date', 'Input Received Date'], ['start_date', 'Start Date'],
  ['target_date', 'Target Date'], ['delivered_date', 'Delivered Date'], ['active', 'Active'],
];

function exportFilename(kind, timeZone = 'UTC') {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch { fail('Invalid export time zone'); }
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${kind}_${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}.xlsx`;
}

function signature(kind, records) {
  return crypto.createHmac('sha256', jwtSecret).update(JSON.stringify([1, kind, records])).digest('hex');
}

function addManifest(workbook, kind, records) {
  const sheet = workbook.addWorksheet(manifestName, { state: 'veryHidden' });
  const entries = records.map(record => [record.id, kind === 'projects' ? record.project_code : record.task_category]);
  sheet.addRow([1, kind, signature(kind, entries)]);
  entries.forEach(entry => sheet.addRow(entry));
}

function readManifest(workbook, kind) {
  const sheet = workbook.getWorksheet(manifestName);
  if (!sheet) return null;
  const records = [];
  sheet.eachRow((row, index) => { if (index > 1) records.push([row.getCell(1).value, row.getCell(2).value]); });
  const expected = signature(kind, records);
  const actual = sheet.getCell('C1').value;
  if (sheet.getCell('A1').value !== 1 || sheet.getCell('B1').value !== kind ||
      typeof actual !== 'string' || actual.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    fail('Export information is invalid. Export a fresh workbook and apply your changes again.');
  }
  return records;
}

function createSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(([key, header]) => ({ key, header, width: 24 }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

// Ranges avoid creating empty data rows, so an empty catalog stays header-only.
function addDropdowns(workbook, sheet, columns, lists) {
  const options = workbook.addWorksheet('_Dropdowns', { state: 'veryHidden' });
  let index = 0;
  for (const [key, choices] of Object.entries(lists)) {
    const values = [...new Set(choices)].filter(value => value !== null && value !== undefined && value !== '');
    const col = ++index;
    options.getCell(1, col).value = key;
    (values.length ? values : ['']).forEach((value, row) => { options.getCell(row + 2, col).value = value; });
    const name = `Choices_${key}`;
    const letter = options.getColumn(col).letter;
    workbook.definedNames.add(`'_Dropdowns'!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`, name);
    const target = sheet.getColumn(columns.findIndex(([field]) => field === key) + 1).letter;
    sheet.dataValidations.add(`${target}2:${target}${Math.max(10001, sheet.rowCount + 1000)}`, {
      type: 'list', allowBlank: true, formulae: [name], showErrorMessage: true,
      errorStyle: 'stop', errorTitle: 'Choose a listed value', error: 'Use the dropdown list for this field.',
    });
  }
}

function cellValue(cell, rowNumber) {
  const value = cell.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if (value.error) fail(`Row ${rowNumber}, ${cell.address}: Excel error ${value.error}`);
    if (value.formula || value.sharedFormula) {
      if (value.result === undefined || (value.result && typeof value.result === 'object')) fail(`Row ${rowNumber}, ${cell.address}: replace the formula with a value`);
      return value.result;
    }
    if (value.richText) return value.richText.map(part => part.text).join('');
    if (value.text !== undefined) return value.text;
    fail(`Row ${rowNumber}, ${cell.address}: unsupported cell value`);
  }
  return value;
}

async function readWorkbook(filePath, kind, columns, required) {
  const workbook = new ExcelJS.Workbook();
  if (path.extname(filePath).toLowerCase() === '.csv') await workbook.csv.readFile(filePath);
  else await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(kind === 'projects' ? 'Projects' : 'Tasks') || workbook.worksheets[0];
  if (!sheet) fail('The file has no worksheet');
  const aliases = { 'Billable Task IDs': 'billable_task_ids', 'Non-Billable Task IDs': 'non_billable_task_ids' };
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, index) => {
    const header = String(cellValue(cell, 1) ?? '').trim();
    const key = columns.find(([field, label]) => header === field || header === label)?.[0] || aliases[header];
    if (!key) return;
    if ([...headers.values()].includes(key)) fail(`Duplicate column: ${header}`);
    headers.set(index, key);
  });
  for (const key of required) if (![...headers.values()].includes(key)) fail(`Missing column: ${columns.find(([field]) => field === key)[1]}`);
  const manifest = readManifest(workbook, kind);
  if (manifest && ![...headers.values()].includes('id')) fail(`Keep the ${kind === 'projects' ? 'Project' : 'Task'} ID column in exported workbooks`);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const input = {};
    headers.forEach((key, index) => { input[key] = cellValue(row.getCell(index), rowNumber) ?? ''; });
    if (Object.values(input).some(value => value !== '' && value !== null)) rows.push({ input, rowNumber });
  });
  return { rows, manifest };
}

function activeValue(value) {
  if (value === '' || value === undefined || value === null) fail('Active must be Yes or No');
  if ([true, 1, '1', 'yes', 'active'].includes(typeof value === 'string' ? value.toLowerCase().trim() : value)) return 1;
  if ([false, 0, '0', 'no', 'inactive'].includes(typeof value === 'string' ? value.toLowerCase().trim() : value)) return 0;
  fail('Active must be Yes or No');
}

function recordId(value) {
  if (value === '' || value === undefined || value === null) return null;
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Invalid record ID');
  return Number(value);
}

function idList(value) {
  if (typeof value === 'number') return [value];
  return String(value ?? '').trim() ? String(value).split(';').map(value => value.trim()) : [];
}

module.exports = { projectColumns, taskColumns, exportFilename, addManifest, createSheet, addDropdowns, readWorkbook, activeValue, recordId, idList };

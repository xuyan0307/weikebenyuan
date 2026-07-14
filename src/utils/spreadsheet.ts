export type SpreadsheetValue = string | number | boolean | null | undefined;

function xmlEscape(value: SpreadsheetValue): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => { result.set(part, offset); offset += part.length; });
  return result;
}

function createStoredZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const filename = encoder.encode(name);
    const body = encoder.encode(content);
    const crc = crc32(body);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length), u16(filename.length), u16(0), filename, body,
    ]);
    localParts.push(local);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length), u16(filename.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), filename,
    ]));
    offset += local.length;
  });

  const central = concat(centralParts);
  return concat([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(centralParts.length), u16(centralParts.length),
    u32(central.length), u32(offset), u16(0),
  ]);
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function downloadXlsx(filename: string, headers: string[], rows: SpreadsheetValue[][]): void {
  const sheetRows = [headers, ...rows].map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  const archive = createStoredZip(files);
  const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  const blob = new Blob([archiveBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n') { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

async function unzipEntry(data: Uint8Array, offset: number, compressedSize: number, method: number): Promise<Uint8Array> {
  const nameLength = readU16(data, offset + 26);
  const extraLength = readU16(data, offset + 28);
  const body = data.slice(offset + 30 + nameLength + extraLength, offset + 30 + nameLength + extraLength + compressedSize);
  if (method === 0) return body;
  if (method === 8 && typeof DecompressionStream !== 'undefined') {
    const bodyBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const stream = new Blob([bodyBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error('该 Excel 文件使用了当前浏览器不支持的压缩格式，请另存为 CSV 后重试。');
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const data = new Uint8Array(buffer);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i -= 1) {
    if (readU32(data, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('无法识别 Excel 文件。');
  const entryCount = readU16(data, end + 10);
  let pointer = readU32(data, end + 16);
  const decoder = new TextDecoder();
  const entries = new Map<string, { offset: number; compressedSize: number; method: number }>();
  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(data, pointer) !== 0x02014b50) break;
    const method = readU16(data, pointer + 10);
    const compressedSize = readU32(data, pointer + 20);
    const nameLength = readU16(data, pointer + 28);
    const extraLength = readU16(data, pointer + 30);
    const commentLength = readU16(data, pointer + 32);
    const localOffset = readU32(data, pointer + 42);
    const name = decoder.decode(data.slice(pointer + 46, pointer + 46 + nameLength));
    entries.set(name, { offset: localOffset, compressedSize, method });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  const readText = async (name: string) => {
    const entry = entries.get(name);
    return entry ? decoder.decode(await unzipEntry(data, entry.offset, entry.compressedSize, entry.method)) : '';
  };
  const sharedXml = await readText('xl/sharedStrings.xml');
  const parser = new DOMParser();
  const shared = sharedXml ? Array.from(parser.parseFromString(sharedXml, 'application/xml').getElementsByTagName('si')).map(node => node.textContent || '') : [];
  const worksheetName = Array.from(entries.keys()).find(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!worksheetName) throw new Error('Excel 文件中没有可读取的工作表。');
  const document = parser.parseFromString(await readText(worksheetName), 'application/xml');
  return Array.from(document.getElementsByTagName('row')).map(row => {
    const result: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach(cell => {
      const ref = cell.getAttribute('r') || 'A1';
      const colText = ref.replace(/\d/g, '');
      let column = 0;
      for (let i = 0; i < colText.length; i += 1) column = column * 26 + colText.charCodeAt(i) - 64;
      const index = Math.max(0, column - 1);
      const type = cell.getAttribute('t');
      const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
      result[index] = type === 's' ? (shared[Number(raw)] || '') : (type === 'inlineStr' ? (cell.textContent || '') : raw);
    });
    return result.map(value => value ?? '');
  }).filter(row => row.some(value => value.trim()));
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
  return parseCsv(await file.text());
}

export function rowsToObjects(rows: string[][]): Array<Record<string, string>> {
  if (rows.length < 2) return [];
  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, (row[index] || '').trim()])))
    .filter(item => Object.values(item).some(Boolean));
}

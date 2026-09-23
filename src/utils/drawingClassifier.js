// ─── Drawing classifier ─────────────────────────────────────────────────────
// Works out which discipline/category a drawing belongs to from its drawing
// number, file name, title and (optionally) the text on its first page.

export const OTHER_CATEGORY = 'Other';

// Discipline letters/abbreviations commonly used as a segment of a drawing number,
// e.g. BGTPS-E-SLD-001, 4610-171-001-PVC-C-002, KHG-ST-GA-004
const CODE_SEGMENTS = {
  'Electrical':           ['E', 'EL', 'ELE', 'ELEC', 'EE'],
  'Civil':                ['C', 'CV', 'CIV', 'CE', 'A', 'AR', 'ARC', 'ARCH'],
  'Structural':           ['ST', 'STR', 'STRL', 'SE'],
  'Mechanical':           ['M', 'ME', 'MEC', 'MECH', 'FF', 'HV', 'HVAC'],
  'SCADA & Telecom':      ['S', 'SC', 'SCD', 'T', 'TEL', 'TC', 'IT', 'COM'],
  'Protection & Control': ['P', 'PC', 'PNC', 'CP', 'CRP', 'PR', 'PRT'],
};

// Keywords (lower-case). Multi-word phrases are matched as-is.
const KEYWORDS = {
  'Electrical': [
    'electrical', 'single line', 'sld', 'earthing', 'grounding', 'earth mat', 'cable', 'cabling',
    'lighting', 'illumination', 'transformer', 'switchgear', 'switchyard', 'bus bar', 'busbar',
    'mcc', 'pcc', 'acdb', 'dcdb', 'ldb', 'lt panel', 'ht panel', 'dg set', 'ups', 'inverter', 'pcs',
    'battery', 'bess', 'lightning', 'lightning arrester', 'auxiliary power', 'power supply',
    'key diagram', 'equipment layout', 'string', 'combiner', 'kv', 'feeder', 'isolator', 'breaker',
  ],
  'Civil': [
    'civil', 'foundation', 'road', 'drain', 'drainage', 'fencing', 'fence', 'grading', 'levelling',
    'leveling', 'boundary wall', 'pile', 'piling', 'excavation', 'rcc', 'pcc bed', 'plinth', 'trench',
    'culvert', 'building', 'architectural', 'plot plan', 'site plan', 'contour', 'topographic',
    'topography', 'soil', 'geotech', 'retaining wall', 'gate', 'control room building', 'pedestal',
    'sump', 'septic', 'water tank', 'pavement', 'gravel',
  ],
  'Structural': [
    'structural', 'structure', 'steel', 'truss', 'gantry', 'tower', 'beam', 'column', 'bolt',
    'member', 'rafter', 'purlin', 'module mounting', 'mms', 'bracing', 'fabrication', 'anchor',
    'base plate', 'connection detail', 'monopole', 'lattice',
  ],
  'Mechanical': [
    'mechanical', 'hvac', 'ventilation', 'air conditioning', 'chiller', 'piping', 'pipe', 'pump',
    'fire fighting', 'firefighting', 'fire protection', 'hydrant', 'sprinkler', 'deluge',
    'fire suppression', 'novec', 'fm200', 'fm-200', 'aerosol', 'water spray', 'crane', 'hoist',
  ],
  'SCADA & Telecom': [
    'scada', 'telecom', 'communication', 'fibre', 'fiber', 'opgw', 'network', 'rtu', 'plc', 'ems',
    'cctv', 'surveillance', 'architecture', 'ethernet', 'data logger', 'weather station', 'wms',
    'ppc', 'power plant controller', 'ied', 'router', 'switch rack', 'pmu', 'plcc',
  ],
  'Protection & Control': [
    'protection', 'relay', 'control scheme', 'schematic', 'crp', 'control & relay', 'control and relay',
    'metering', 'energy meter', 'interlock', 'logic diagram', 'sas', 'substation automation', 'tripping',
    'ct & pt', 'ct/pt', 'current transformer', 'potential transformer', 'annunciation', 'wiring diagram',
    'terminal', 'ferrule',
  ],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYWORD_RES = Object.fromEntries(
  Object.entries(KEYWORDS).map(([cat, words]) => [
    cat,
    words.map(w => ({ word: w, re: new RegExp(`(^|[^a-z0-9])${escapeRe(w)}(?=$|[^a-z0-9])`, 'gi') })),
  ])
);

/**
 * Classify a drawing.
 * @param {{code?: string, fileName?: string, title?: string, text?: string, categories?: string[]}} input
 * @returns {{ category: string, confidence: 'high'|'medium'|'low', reason: string }}
 */
export function classifyDrawing({ code = '', fileName = '', title = '', text = '', categories } = {}) {
  const allowed = categories && categories.length ? categories : Object.keys(KEYWORDS);
  const scores = {};
  const reasons = {};
  const bump = (cat, pts, why) => {
    if (!allowed.includes(cat)) return;
    scores[cat] = (scores[cat] || 0) + pts;
    (reasons[cat] = reasons[cat] || []).push(why);
  };

  // 1. Discipline segment inside the drawing number (strongest signal)
  const segs = String(code || '').toUpperCase().split(/[-_/.\s]+/).filter(Boolean);
  // ignore the very first segment (usually a project prefix) unless it's the only one
  const checkSegs = segs.length > 1 ? segs.slice(1) : segs;
  for (const [cat, abbrs] of Object.entries(CODE_SEGMENTS)) {
    const hit = checkSegs.find(s => abbrs.includes(s));
    if (hit) bump(cat, 6, `code segment "${hit}"`);
  }

  // 2. Keywords in the file name and title (strong)
  const nameText = `${fileName.replace(/\.[a-z0-9]+$/i, '')} ${title}`.replace(/[_]+/g, ' ').toLowerCase();
  // 3. Keywords in the first-page text (weak, capped)
  const bodyText = String(text || '').toLowerCase().slice(0, 20000);

  for (const [cat, list] of Object.entries(KEYWORD_RES)) {
    let bodyPts = 0;
    for (const { word, re } of list) {
      re.lastIndex = 0;
      if (re.test(nameText)) bump(cat, 3, `"${word}" in name/title`);
      re.lastIndex = 0;
      const n = (bodyText.match(re) || []).length;
      if (n) bodyPts += Math.min(n, 3);
    }
    if (bodyPts) bump(cat, Math.min(bodyPts, 6) * 0.5, 'keywords in drawing text');
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 1) {
    return { category: OTHER_CATEGORY, confidence: 'low', reason: 'No discipline indicators found' };
  }
  const [bestCat, best] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const confidence = best >= 6 && best - second >= 3 ? 'high' : best >= 3 ? 'medium' : 'low';
  const uniq = [...new Set(reasons[bestCat])].slice(0, 3).join(', ');
  return { category: bestCat, confidence, reason: uniq };
}

/**
 * Best-effort extraction of drawing number, title and revision from a file name
 * and title-block text. Returns empty strings for anything not found.
 */
export function extractDrawingInfo(fileName = '', fullText = '') {
  const nameClean = fileName.replace(/\.pdf$/i, '');
  const nameParts = nameClean.split(/[_\s]+/);
  const fnCode = (nameParts[0] || '').toUpperCase();
  const isRevToken = (t) => /^R(?:EV)?[.]?\d{1,2}$/i.test(t);
  const fnTitle = nameParts.length > 1
    ? nameParts.slice(1).filter(t => !isRevToken(t)).join(' ').replace(/-/g, ' ').trim()
    : '';

  const isCommonWord = (w) => /LIMITED|COMPANY|PROJECT|TITLE|OWNER|EPC|CONSULTANT|DRAWING|REFERENCE/i.test(w);
  const isDate = (w) => /^\d{2}[-./]\d{2}[-./]\d{4}$/.test(w) || /^\d{4}[-./]\d{2}[-./]\d{2}$/.test(w);

  const dwgNoPatterns = [
    /(?:DRG[\s.-]?NO|DWG[\s.-]?NO|DOC[\s.-]?NO|DRAWING[\s-]?NO)[\s.:–-]*\s*([A-Z0-9\-/._]{5,30})/i,
    /(?:DOC(?:UMENT)?\s*(?:NO|NUMBER|#))[\s.:–-]*\s*([A-Z0-9\-/._]{5,30})/i,
  ];
  let textCode = '';
  for (const p of dwgNoPatterns) {
    for (const m of fullText.matchAll(new RegExp(p.source, p.flags + 'g'))) {
      const v = (m[1] || '').trim();
      if (v.length >= 5 && /[-/_]/.test(v) && !isCommonWord(v) && !isDate(v)) { textCode = v.toUpperCase(); break; }
    }
    if (textCode) break;
  }

  const titlePatterns = [
    /(?:DRAWING\s*TITLE|TITLE\s*OF\s*DRAWING|SHEET\s*TITLE)[\s.:–-]+(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
    /TITLE\s*:\s*(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
  ];
  let textTitle = '';
  for (const p of titlePatterns) {
    const m = fullText.match(p);
    if (m && m[1]) {
      const t = m[1].replace(/\s+/g, ' ').trim();
      if (t && t.length > 3 && t.length < 160 && !/DRAWING NOS|REFERENCE DRAWINGS/i.test(t)) { textTitle = t; break; }
    }
  }

  let rev = '';
  const revM = nameClean.match(/(?:^|[_\s-])(R(?:EV)?[\s.]?\d{1,2})(?=$|[_\s-])/i) || fullText.match(/\bREV(?:ISION)?[\s.:–-]*(\d{1,2}|[A-Z]\d?)\b/i);
  if (revM) {
    const raw = revM[1].toUpperCase().replace(/[\s.]/g, '').replace(/^REV/, 'R');
    rev = /^\d+$/.test(raw) ? `R${raw}` : raw;
  }

  // Prefer a drawing number found in the file name if it looks like a real code
  const fnLooksLikeCode = /[-/]/.test(fnCode) && fnCode.length >= 5 && /\d/.test(fnCode);
  // Plain names like "Fire hydrant layout.pdf" → use the whole name, not just its first word
  const nameNoRev = nameParts.filter(t => !isRevToken(t)).join(' ');
  const wholeNameCode = nameNoRev.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const code = fnLooksLikeCode ? fnCode : (textCode || wholeNameCode || fnCode);
  const title = textTitle || (fnLooksLikeCode ? fnTitle : '') || nameNoRev.replace(/[_]+/g, ' ').trim();
  return { code, title, rev };
}

// ─── CRS (Comment Resolution Sheet) matching ────────────────────────────────
export const isExcelFile = (name = '') => /\.(xlsx|xls|xlsm)$/i.test(name);

const norm = (s = '') => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const CRS_WORDS = /\b(CRS|COMMENTS?|RESOLUTION|RESPONSE|REPLY|SHEET|COMPLIANCE|REV(?:ISION)?[.\s]?\d{0,2}|R\d{1,2})\b/gi;

/**
 * Find which drawing an Excel CRS file belongs to.
 * candidates: [{ key, code, fileName? }] — returns the best key or null.
 */
export function matchCrsToDrawing(excelName, candidates) {
  const base = excelName.replace(/\.[a-z0-9]+$/i, '');
  const nBase = norm(base);
  const nStripped = norm(base.replace(/[_-]+/g, ' ').replace(CRS_WORDS, ' '));
  let best = null, bestLen = 0;
  for (const c of candidates) {
    const nCode = norm(c.code);
    const nFile = norm((c.fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(CRS_WORDS, ' '));
    // same file name apart from "CRS"/revision words
    if (nFile && nStripped && nFile === nStripped) return c.key;
    // drawing number appears in the Excel file name
    if (nCode.length >= 5 && nBase.includes(nCode) && nCode.length > bestLen) { best = c.key; bestLen = nCode.length; }
  }
  return best;
}

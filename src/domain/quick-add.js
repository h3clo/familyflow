/**
 * Rule-based Korean quick-add for shopping lines.
 * Works without AI. Returns null if nothing useful found.
 */
const UNIT_RE = '(롤|개|봉|팩|병|캔|포|장|kg|g|ml|L|리터|망|묶음|세트|판)';

const NOISE =
  /이번\s*장보기\s*목록에|장보기\s*목록에|목록에|이번\s*장보기에|장보기에|장보기|넣어줘|추가해줘|사줘|다\s*떨어졌어|떨어졌어|없어졌어|부탁|제발|[.!?~,]+/g;

export function parseQuickAdd(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, ' ');
  const stripped = normalized.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

  // Prefer matches on stripped text so filler phrases don't stick to the name.
  const hit =
    matchQtyUnit(stripped) ||
    matchQtyUnit(normalized) ||
    matchBare(stripped);

  if (!hit) return null;

  return {
    ...hit,
    priority: inferPriority(normalized),
    category: inferCategory(hit.name),
    note: '',
    estimatedPrice: hit.estimatedPrice ?? null,
    sourceText: raw,
  };
}

function matchQtyUnit(text) {
  // Take the last "이름 수량단위" in the sentence (e.g. filler then "휴지 30롤").
  const re = new RegExp(
    `([가-힣A-Za-z0-9]+)(?:을|를|이|가)?\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}`,
    'gi',
  );
  let m;
  let last = null;
  while ((m = re.exec(text))) last = m;
  if (!last) return null;
  const name = cleanName(last[1]);
  if (!name || name.length > 40) return null;
  return {
    name,
    quantity: Number(last[2]),
    unit: normalizeUnit(last[3]),
  };
}

function matchBare(text) {
  const priceOnly = text.match(/^([가-힣\w\s]{1,40}?)\s+(\d{3,7})원$/);
  if (priceOnly) {
    return {
      name: cleanName(priceOnly[1]),
      quantity: 1,
      unit: '개',
      estimatedPrice: Number(priceOnly[2]),
    };
  }

  const bare = cleanName(text);
  if (bare && bare.length <= 40 && !/^(오늘|이번|그냥|그리고)$/.test(bare)) {
    return { name: bare, quantity: 1, unit: '개' };
  }
  return null;
}

function cleanName(s) {
  return String(s || '')
    .replace(NOISE, ' ')
    .replace(/(을|를|이|가|은|는)$/u, '')
    .replace(/^(그리고|또|근데|그래서|일단|혹시)\s+/u, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUnit(u) {
  const x = String(u || '개').toLowerCase();
  if (x === '리터' || x === 'l') return 'L';
  return u;
}

function inferPriority(text) {
  if (/다\s*떨어|없음|필수|꼭|급해|당장|없어/.test(text)) return 'must';
  if (/있으면\s*좋|여유|선택/.test(text)) return 'nice';
  return 'must';
}

const HOUSEHOLD = /휴지|화장지|세제|섬유유연제|주방세제|쓰레기봉투|랩|호일|물티슈|샴푸|린스|치약|비누|고무장갑/;
const SNACK =
  /과자|쿠키|초콜릿|초코|사탕|젤리|아이스크림|스낵|간식|빵|찐빵|케이크|비스킷|칩|팝콘|견과|에너지바|요거트/;
const FOOD = /고기|닭|돼지|소고기|야채|채소|브로콜리|양파|마늘|계란|달걀|우유|밥|쌀|김치|두부|라면|소스|간장|기름/;

/** Pick a known category from the item name — prefer this over inventing freeform tags. */
export function inferCategory(name) {
  if (HOUSEHOLD.test(name)) return 'household';
  if (SNACK.test(name)) return 'snack';
  if (FOOD.test(name)) return 'food';
  return 'other';
}

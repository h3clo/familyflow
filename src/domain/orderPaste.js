/**
 * Parse pasted Naver Pay / My Shopping order history into inventory proposals.
 * Rules are product decisions — see docs/DECISIONS.md §8.
 */
import { inferCategory } from './quick-add.js';

const NAVER_PAY_HISTORY_URL =
  'https://pay.naver.com/pc/history?page=1&serviceChannel=SHOPPING';

export { NAVER_PAY_HISTORY_URL };

/** Status / chrome lines that mean “not a purchasable line”. */
const SKIP_STATUS =
  /^(반품환불완료|취소완료|반품정보|취소정보|내역 삭제|상세보기|판매자|정보\/문의|옵션 더보기|장바구니 담기|전체 상품 장바구니|바로 구매하기|리뷰쓰기|리뷰쓰고|구매확정하고|무료교환반품|무료반품|배송지변경|영수증조회|반품요청|교환요청|구매확정연장|한달사용리뷰|구매확정\s*\d|구매확정\(|적립|다시 담기|배송조회)/;

const SKIP_LINE =
  /^(본문으로 바로가기|NAVER|네이버페이|네이버$|사용자 링크|내 프로필|네이버톡|알림|메일|서비스 더보기|검색|카테고리|마이쇼핑|주문\/배송|찜한|최근 본|관심 스토어|정기구독|무료체험|상품 Q&A|네이버페이내역|검색어|검색창|페이 서비스|전체선택|현장결제|가맹점|예약·주문|결제한 상품|자주 산|중고로 팔기|자주 구매|자주구매|총 \d+건|주문 접기|주문 펼쳐보기|더보기$|이전|다음|처음|마지막|로그아웃|쇼핑&페이|약관|개인정보|신용정보|NAVER FINANCIAL|네이버파이낸셜|큐레이션|추천 더보기|지금 여기서만|추가적립|페이서비스|포인트|머니|송금|자산 관리|고객지원|사업자|페이지 중|현재\d|님을 위한|구매할 때 되셨나요|결제일시|주문 상세|네이버페이주문|포함 \d+건|배송비|판매가|할인율|즉시할인가|상품 명|상품 가격|상품가격|상품주문번호|주문번호|주문상품|주문금액|상품금액|쿠폰할인|결제정보|배송지|배송지명|연락처|수령위치|출입방법|안내 보기|멤버십|패밀리 대표|결제 요청|문의하기|접기|펼치기|무료 배송|신용카드|일시불|충전결제|구매적립|리뷰적립|기본적립|도착 보장|AI 안내|옵션$|옵션명)/i;

/** Order-detail chrome that must never become inventory/clarify rows. */
const SKIP_DETAIL_CHROME =
  /^(주문번호|멤버십|패밀리|주문상품|문의하기|상품가격|상품주문번호|옵션명|전체 상품|연락처|주소|수령|결제정보|주문금액|상품금액|쿠폰|안내 보기|신용카드|배송지|판매자|비씨\s*\d|총\s*[\d,]+원|상품명\s*$|옵션\s*$|접기|펼치기)/;

/** Durables / fashion / samples — not household stock. */
const SKIP_PRODUCT =
  /마사지기|미들힐|펌프스|구두|서류가방|텀블러|체험딜|체험단|시카밤|귀걸이|반지|신발|힐\b|가방\b/;

const BRAND_BRACKET = /^\[[^\]]+\]\s*/g;
/** Seller / store prefix glued in front of brand brackets on history rows. */
const SELLER_PREFIX = /^(?:컬리N마트|마켓컬리|쿠팡|네이버쇼핑)\s*/i;
const COLLAB = /\s*x\s*마켓컬리/gi;
const EMPTY_BRACKETS = /\[\s*\]\s*/g;

/** Marketing / origin fluff stripped from names. */
const NAME_NOISE =
  /국산\s*|국내산\s*|무항생제\s*|1등급\s*|당도선별\s*|제주\s*|영암\s*|강원(?:도)?\s*|고랭지\s*|황토\s*|흙(?=대파|당근)|친환경\s*|저온압착\s*|순수\s*|급냉\s*|IQF\s*|한통\s*|한돈\s*|넉넉하게 담은\s*|껍질째 먹는\s*|간편한\s*|햇\s*|세척\s*|가정용\s*|100%\s*|무첨가\s*|무가당\s*|크리미\s*|글루텐프리\s*|특제\s*|아삭\s*|더 진한\s*|전용목장|도착보장\s*|네이버 N배송\s*|컬리N마트\s*|골라담기\s*|3겹\s*|천연펄프\s*|부드러운\s*|이중미세모\s*|혀클리너\s*|칫솔캡\s*|파손보상\s*|찬란\s*|해외\s*|스테비아 커피\s*|제로슈거\s*|스위티오\s*|맥심\s*|모카골드\s*|KF365\s*|KS365\s*|Kurly'?s\s*|포스트\s*|풀무원\s*|오뚜기\s*|농심\s*|삼양\s*|면사랑\s*|서울우유\s*|연세우유\s*|건국유업\s*|자연실록\s*|바름팜\s*|제각각\s*|Kim'?s butcher\s*|Dole\s*|ardo\s*|YOZM\s*|배대감\s*|엘라스틴\s*|헤트라스\s*|프리미엄\s*|스너글\s*|드라이시트\s*|블루스파클\s*|에이센트\s*|고체\s*|화장실\s*|담배\s*|집안\s*|실내\s*|홀애비\s*|남자\s*|방\s*|냄새 제거\s*|프레쉬린넨\s*|SOGA\s*|대한민국농수산\s*|쉐프원\s*|정통\s*|칸나멜라\s*|경기\s*|26년\s*|햇양파\s*|무안\s*|창녕\s*|분말\s*/gi;

const STORAGE_MARK = /\s*\((?:냉장|냉동)\)\s*/g;
const GRADE_MARK = /\s*\((?:로얄과|특란|정육)\)\s*/g;
const PROMO_BRACKET = /^\[[^\]]*원[^\]]*\]\s*/g;
const DEAL_BRACKET = /^\[(?:100원딜|체험딜)[^\]]*\]\s*/i;

const UNIT_TOKEN = '구|개입|개|입|봉|롤|매|팩|병|캔|포|장|판|인분|kg|g|ml|mL|L|리터';

/** Condiment / powder — name only, no quantity required. */
const STATUS_ONLY =
  /^(넛맥|너트멕|참기름|들기름|식용유|올리브유|간장|식초|설탕|소금|후추|고춧가루|카레|허브|향신료)/;

/** Count-first produce (fruit-like). Weight still wins for 단호박 (metering). */
const COUNT_FIRST = /감귤|귤|사과|배|포도|딸기|수박|참외|복숭아|자두|체리|망고|키위|바나나|옥수수/;

/**
 * @typedef {{ name: string, quantity: number|null, unit: string|null, category: string, location: string, status: string, sourceText: string, needsClarify?: boolean, clarifyReason?: string }} OrderPasteItem
 */

/**
 * @param {string} text
 * @returns {{ ready: OrderPasteItem[], needsClarify: OrderPasteItem[], skipped: string[] }}
 */
export function parseOrderPaste(text) {
  const raw = String(text || '');
  if (!raw.trim()) {
    return { ready: [], needsClarify: [], skipped: [] };
  }

  const titles = extractProductTitles(raw);
  const ready = [];
  const needsClarify = [];
  const skipped = [];
  const seen = new Set();

  for (const title of titles) {
    if (SKIP_PRODUCT.test(title)) {
      skipped.push(title);
      continue;
    }
    const item = normalizeOrderTitle(title);
    if (!item) {
      skipped.push(title);
      continue;
    }
    const key = `${item.name}|${item.quantity}|${item.unit}|${item.needsClarify ? item.clarifyReason : ''}`;
    if (seen.has(key) && !item.needsClarify) continue;
    seen.add(key);

    if (item.needsClarify) needsClarify.push(item);
    else ready.push(item);
  }

  return { ready, needsClarify, skipped };
}

/** Pull distinct product title lines from a noisy paste. */
export function extractProductTitles(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const titles = [];
  const seen = new Set();
  /** @type {'ok'|'skip'} */
  let block = 'ok';

  // Order-detail pages often repeat each item as 상품명… — prefer those when present.
  const detailNames = lines
    .filter((l) => /^상품명\s*/.test(l))
    .map((l) => cleanTitleLine(l.replace(/^상품명\s*/, '')))
    .filter((l) => l && l.length >= 2 && !SKIP_DETAIL_CHROME.test(l));

  if (detailNames.length >= 1) {
    for (const cleaned of detailNames) {
      const dedupeKey = normalizeTitleKey(cleaned);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      titles.push(cleaned);
    }
    return titles;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^(반품환불완료|취소완료)\b/.test(line)) {
      block = 'skip';
      continue;
    }
    if (/^(결제완료|배송완료|구매확정완료|구매확정\b|상품준비중)\b/.test(line)) {
      block = 'ok';
      // fall through — line itself is not a product
    }

    if (shouldSkipLine(line)) continue;
    if (/^옵션명\s*:/.test(line)) continue; // duplicate of product title on detail pages
    if (/원$/.test(line) && !/[가-힣]{2,}/.test(line.replace(/[\d,원]/g, ''))) continue;
    if (/^\d{1,2}\.\s*\d{1,2}/.test(line) && /주문|결제/.test(line)) continue;
    if (/배송|구매확정|결제완료|상품준비|새벽배송|내일배송|오늘배송|KURLY\./i.test(line) && line.length < 80) {
      // status-only short lines
      if (!/\[[^\]]+\]/.test(line) && !/[가-힣]{4,}.*\d/.test(line)) continue;
    }

    // Collapsed multi-item groups need clarify — keep as title with marker.
    if (/포함\s*\d+\s*건/.test(line) || (/총\s*\d+\s*건/.test(line) && /자세히/.test(line))) {
      if (block === 'skip') continue;
      const cleaned = cleanTitleLine(line.replace(/자세히 보기.*$/, '').replace(/총\d+건/, '').trim());
      if (cleaned && !seen.has(normalizeTitleKey(cleaned))) {
        seen.add(normalizeTitleKey(cleaned));
        titles.push(/포함/.test(cleaned) ? cleaned : `${cleaned} 포함 묶음`);
      }
      continue;
    }

    // Typical product lines: brackets, hangul + weight/count, or long hangul names.
    const looksProduct =
      /^\[[^\]]+\]/.test(line) ||
      new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${UNIT_TOKEN})`, 'i').test(line) ||
      (/[가-힣]{2,}/.test(line) &&
        line.length >= 4 &&
        line.length <= 120 &&
        !SKIP_STATUS.test(line) &&
        !SKIP_DETAIL_CHROME.test(line) &&
        !/원$/.test(line));

    if (!looksProduct) continue;
    if (block === 'skip') continue;

    const cleaned = cleanTitleLine(line);
    if (!cleaned || cleaned.length < 2) continue;
    if (SKIP_DETAIL_CHROME.test(cleaned)) continue;
    const dedupeKey = normalizeTitleKey(cleaned);
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    titles.push(cleaned);
  }

  return titles;
}

function shouldSkipLine(line) {
  if (!line) return true;
  if (SKIP_STATUS.test(line)) return true;
  if (SKIP_LINE.test(line)) return true;
  if (SKIP_DETAIL_CHROME.test(line)) return true;
  if (/^\d{1,3}원$/.test(line)) return true;
  if (/^\d{1,3}(,?\d{3})+원$/.test(line)) return true;
  if (/최대\s*\+?\d+원/.test(line)) return true;
  if (/N번 구매했어요|번 구매했어요/.test(line)) return true;
  if (/자동 구매확정/.test(line)) return true;
  if (/카드 취소/.test(line)) return true;
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(line)) return true; // date stamps on detail header
  if (/^\*{2,}/.test(line) || /\*{3,}/.test(line)) return true;
  if (/자유출입|문 앞|비밀번호/.test(line)) return true;
  if (/결제일시|원결제/.test(line)) return true;
  if (/^\d{1,3}(,?\d{3})*원/.test(line) && /결제/.test(line)) return true;
  return false;
}

function cleanTitleLine(line) {
  return String(line || '')
    .replace(/^상품명\s*/u, '')
    .replace(/^옵션명\s*:\s*/u, '')
    .replace(SELLER_PREFIX, '')
    .replace(/자세히 보기.*$/u, '')
    .replace(/총\s*\d+\s*건.*$/u, '')
    .replace(/포함\s*\d+\s*건.*$/u, ' 포함 묶음')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dedupe key after stripping seller/brand brackets / spaces. */
function normalizeTitleKey(title) {
  let t = String(title || '').replace(SELLER_PREFIX, '');
  // Strip every leading brand/promo bracket so history + store-prefixed rows collide.
  for (let i = 0; i < 6; i++) {
    const next = t
      .replace(/^\[[^\]]*원[^\]]*\]\s*/u, '')
      .replace(/^\[[^\]]+\]\s*/u, '')
      .replace(EMPTY_BRACKETS, '')
      .trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, '').toLowerCase();
}

/**
 * Normalize one product title into an inventory-shaped proposal.
 * @param {string} title
 * @returns {OrderPasteItem|null}
 */
export function normalizeOrderTitle(title) {
  let t = String(title || '').trim();
  if (!t) return null;
  t = t
    .replace(/^상품명\s*/u, '')
    .replace(/^옵션명\s*:\s*/u, '')
    .replace(SELLER_PREFIX, '')
    .trim();
  if (!t) return null;
  if (SKIP_DETAIL_CHROME.test(t) || SKIP_LINE.test(t) || SKIP_STATUS.test(t)) return null;
  if (/결제일시|원결제/.test(t)) return null;

  const location = guessLocationFromTitle(t) || undefined;

  if (/포함\s*묶음|포함\s*\d+\s*건/.test(t)) {
    const nameGuess =
      canonicalName(stripToName(t.replace(/포함\s*묶음|포함\s*\d+\s*건/g, '').trim())) || '묶음 주문';
    return clarify(nameGuess, t, '접힌 주문(포함 N건)이에요. 펼친 목록을 붙여 주세요.', location);
  }

  // Cancelled / returned markers sometimes stick to title context — caller filters status;
  // still skip obvious durable.
  if (SKIP_PRODUCT.test(t)) return null;
  // Peel seller + stacked brand/promo brackets (history rows: 컬리N마트[KF365] …).
  t = t.replace(SELLER_PREFIX, '');
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(DEAL_BRACKET, '')
      .replace(PROMO_BRACKET, '')
      .replace(BRAND_BRACKET, '')
      .replace(EMPTY_BRACKETS, '')
      .trim();
    if (next === t) break;
    t = next;
  }
  t = t
    .replace(COLLAB, ' ')
    .replace(STORAGE_MARK, ' ')
    .replace(GRADE_MARK, ' ')
    .replace(/\s*\(\d{2}년\s*햇\)\s*/g, ' ')
    .replace(EMPTY_BRACKETS, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Gift / bonus after +
  if (/\+\s*.*증정/.test(t)) {
    t = t.replace(/\+\s*.*증정.*$/u, '').trim();
  }

  // Slash size options e.g. 500g/1kg
  if (/\d+(?:\.?\d+)?\s*(?:kg|g|ml|L)\s*\/\s*\d+(?:\.?\d+)?\s*(?:kg|g|ml|L)/i.test(t)) {
    const name =
      canonicalName(
        stripToName(t.replace(/\d+(?:\.?\d+)?\s*(?:kg|g|ml|L)\s*\/\s*\d+(?:\.?\d+)?\s*(?:kg|g|ml|L).*$/i, '')),
      ) || canonicalName(stripToName(t));
    return clarify(name || '상품', title, '용량 옵션(예: 500g/1kg)이 있어요. 고른 용량을 알려 주세요.', location);
  }

  // N종 (택1) / 2종 without clear qty
  if (/\d+\s*종/.test(t) && /(택\s*\d+|골라담기)/.test(title + t)) {
    const pick = t.match(/택\s*(\d+)/);
    if (pick && Number(pick[1]) > 1) {
      // 택3 ramen — quantity known, name generic
      const name =
        canonicalName(stripToName(t.replace(/\(택\s*\d+\)/g, '').replace(/\d+\s*종.*$/u, ''))) || '라면';
      return readyItem(name, Number(pick[1]), '개', title, location);
    }
    const name = canonicalName(stripToName(t.replace(/\d+\s*종.*$/u, ''))) || canonicalName(stripToName(t));
    return clarify(name || '상품', title, '옵션(N종)이 상세에만 있어요. 고른 옵션을 알려 주세요.', location);
  }
  if (/\d+\s*종/.test(t) && !/택\s*\d+/.test(t)) {
    const name = canonicalName(stripToName(t.replace(/\d+\s*종.*$/u, ''))) || canonicalName(stripToName(t));
    return clarify(name || '상품', title, '옵션(N종)이 상세에만 있어요. 고른 옵션을 알려 주세요.', location);
  }

  // Bundle: A 620g 2개+시리얼 30g 2개 → main only (first segment before +)
  if (/\d+(?:\.?\d+)?\s*g\s*\d+\s*개\s*\+/.test(t) || /후레이크.*\+.*시리얼/.test(t)) {
    const main = t.split('+')[0].trim();
    const m = main.match(/(\d+(?:\.\d+)?)\s*g\s*(\d+)\s*개/i);
    if (m) {
      const name = stripToName(main.replace(/(\d+(?:\.\d+)?)\s*g\s*\d+\s*개.*/i, '')) || '아몬드 후레이크';
      return readyItem(canonicalName(name), Number(m[1]) * Number(m[2]), 'g', title, location);
    }
  }

  // N개+M개 or N구+M구
  const sumPacks = t.match(/(\d+)\s*개\s*\+\s*(\d+)\s*개/);
  if (sumPacks) {
    const name = stripToName(t.replace(/\d+\s*개\s*\+\s*\d+\s*개.*$/u, '').replace(/\d+\s*g/gi, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(sumPacks[1]) + Number(sumPacks[2]), '개', title, location);
  }
  const sumGu = t.match(/(\d+)\s*구\s*\+\s*(\d+)\s*구/);
  if (sumGu) {
    const name = stripToName(t.replace(/\d+\s*구\s*\+\s*\d+\s*구.*$/u, '')) || '구운란';
    return readyItem(canonicalName(name), Number(sumGu[1]) + Number(sumGu[2]), '구', title, location);
  }

  // Pattern: 230g x 5개입 → count (user: 칼국수 5개)
  const gxN = t.match(/(\d+(?:\.\d+)?)\s*g\s*[x×＊*]\s*(\d+)\s*개입/i);
  if (gxN) {
    const name = stripToName(t.replace(/(\d+(?:\.\d+)?)\s*g\s*[x×＊*]\s*\d+\s*개입.*/i, '').replace(/\(개별 포장\)/g, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(gxN[2]), '개', title, location);
  }

  // 18g X 13입 → 13개
  const smallXN = t.match(/(\d+(?:\.\d+)?)\s*g\s*[x×ＸX]\s*(\d+)\s*입/i);
  if (smallXN) {
    const name = stripToName(t.replace(/\(.*\)/g, '').replace(/다운 치즈/g, '치즈')) || '치즈';
    return readyItem(canonicalName(name), Number(smallXN[2]), '개', title, location);
  }

  // 135g＊4입
  const starN = t.match(/(\d+(?:\.\d+)?)\s*g\s*[＊*]\s*(\d+)\s*입/i);
  if (starN) {
    const name = stripToName(t.replace(/(\d+(?:\.\d+)?)\s*g\s*[＊*]\s*\d+\s*입.*/i, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(starN[2]), '개', title, location);
  }

  // 27m X 30롤 → 30롤
  const roll = t.match(/\(?\s*\d+\s*m\s*[x×ＸX]\s*(\d+)\s*롤\s*\)?/i);
  if (roll) {
    return readyItem('화장지', Number(roll[1]), '롤', title, 'storage');
  }

  // 40구(20구＊2ea) / 30구(...)
  const gu = t.match(/(\d+)\s*구\s*(?:\(|$)/);
  if (gu) {
    const name = stripToName(t.replace(/\d+\s*구.*/u, '').replace(/XL/gi, '')) || '달걀';
    return readyItem(canonicalName(name), Number(gu[1]), '구', title, location);
  }

  // 100개입 coffee
  const gaeip = t.match(/(\d+)\s*개입/);
  if (gaeip) {
    const name = stripToName(t.replace(/\d+\s*개입.*/u, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(gaeip[1]), '개', title, location);
  }

  // 2L, 12개 / 500ml, 100개 / 190ml, 6개
  const volCount = t.match(/(\d+(?:\.\d+)?)\s*(L|ml|mL)\s*,\s*(\d+)\s*개/i);
  if (volCount) {
    const name = stripToName(t.replace(/(\d+(?:\.\d+)?)\s*(L|ml|mL)\s*,\s*\d+\s*개.*/i, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(volCount[3]), '개', title, location);
  }

  // 500g, 1개 → prefer weight for metering foods
  const weightThenCount = t.match(/,\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|L)\s*,\s*(\d+)\s*개/i);
  if (weightThenCount) {
    const name = stripToName(t.replace(/,.*/u, '')) || stripToName(t);
    return readyItem(
      canonicalName(name),
      Number(weightThenCount[1]),
      normalizeUnit(weightThenCount[2]),
      title,
      location,
    );
  }
  const trailingCount = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|L)\s*,\s*(\d+)\s*개/i);
  if (trailingCount) {
    const name = stripToName(t.replace(/(\d+(?:\.\d+)?)\s*(kg|g|ml|L)\s*,\s*\d+\s*개.*/i, '')) || stripToName(t);
    return readyItem(
      canonicalName(name),
      Number(trailingCount[1]),
      normalizeUnit(trailingCount[2]),
      title,
      location,
    );
  }

  // N입 (weight) — e.g. 무 1입(1kg), 브로콜리 2입 (500g), 단호박 4~7입 1.5kg
  const ipWeight = t.match(/(\d+)\s*~\s*(\d+)\s*입\s*(\d+(?:\.\d+)?)\s*(kg|g)/i);
  if (ipWeight) {
    const name = stripToName(t.replace(/\d+\s*~\s*\d+\s*입.*/u, '')) || stripToName(t);
    // 단호박 and metering crops → weight
    return readyItem(canonicalName(name), Number(ipWeight[3]), normalizeUnit(ipWeight[4]), title, location);
  }
  const ipWeight2 = t.match(/(\d+)\s*입\s*\(?\s*(\d+(?:\.\d+)?)\s*(kg|g)\s*\)?/i);
  if (ipWeight2) {
    const name = stripToName(t.replace(/\d+\s*입.*/u, '')) || stripToName(t);
    const n = canonicalName(name);
    if (COUNT_FIRST.test(n) && !/단호박|호박/.test(n)) {
      return readyItem(n, Number(ipWeight2[1]), '개', title, location);
    }
    return readyItem(n, Number(ipWeight2[2]), normalizeUnit(ipWeight2[3]), title, location);
  }

  // Plain N입 (가지 3입, 옥수수 5입)
  const ipOnly = t.match(/(\d+)\s*입\s*$/);
  if (ipOnly) {
    const name = stripToName(t.replace(/\d+\s*입\s*$/u, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(ipOnly[1]), '개', title, location);
  }

  // 1봉
  const bong = t.match(/(\d+)\s*봉\s*$/);
  if (bong) {
    const name = stripToName(t.replace(/\d+\s*봉\s*$/u, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(bong[1]), '봉', title, location);
  }

  // 160매
  const mae = t.match(/(\d+)\s*매\s*$/);
  if (mae) {
    const name = stripToName(t.replace(/\d+\s*매\s*$/u, '')) || '건조기시트';
    return readyItem(canonicalName(name), Number(mae[1]), '매', title, 'pantry');
  }

  // 30롤 without m×
  const rolls = t.match(/(\d+)\s*롤\s*$/);
  if (rolls) {
    return readyItem('화장지', Number(rolls[1]), '롤', title, 'storage');
  }

  // 2인분
  const serving = t.match(/\(?\s*(\d+)\s*인분\s*\)?\s*$/);
  if (serving) {
    const name = stripToName(t.replace(/\(?\s*\d+\s*인분\s*\)?\s*$/u, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(serving[1]), '인분', title, location);
  }

  // Trailing weight/volume: 1.8L, 500g, 1kg, 750g, 1.15kg, 700ml, 10g, 200mL
  const wv = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|L)\s*$/i);
  if (wv) {
    const name = stripToName(t.replace(/(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|L)\s*$/i, '')) || stripToName(t);
    return readyItem(canonicalName(name), Number(wv[1]), normalizeUnit(wv[2]), title, location);
  }

  // Weight glued without space: 야채찜1kg, 목살구이1kg
  const glued = t.match(/(.+?)(\d+(?:\.\d+)?)(kg|g|ml|L)$/i);
  if (glued && /[가-힣]/.test(glued[1])) {
    return readyItem(
      canonicalName(stripToName(glued[1])),
      Number(glued[2]),
      normalizeUnit(glued[3]),
      title,
      location,
    );
  }

  // Trailing , 1개 only
  const one = t.match(/,\s*(\d+)\s*개\s*$/);
  if (one) {
    const name = stripToName(t.replace(/,\s*\d+\s*개\s*$/u, '')) || stripToName(t);
    const n = canonicalName(name);
    if (STATUS_ONLY.test(n)) {
      return readyItem(n, null, null, title, 'pantry');
    }
    return readyItem(n, Number(one[1]), '개', title, location);
  }

  // Status-only condiments with no size
  {
    const name = canonicalName(stripToName(t));
    if (name && STATUS_ONLY.test(name)) {
      return readyItem(name, null, null, title, 'pantry');
    }
  }

  // Bare product with no qty — clarify (options likely in detail)
  {
    const name = canonicalName(stripToName(t));
    if (!name) return null;
    if (SKIP_DETAIL_CHROME.test(name) || name.length < 2) return null;
    // Instant noodles / named snack with no qty → 1개
    if (/크뽕|라면|짬뽕|냉면|밀면|우동|나또|낫또/.test(name)) {
      return readyItem(name, 1, '개', title, location);
    }
    // UI leftovers without a real grocery shape → drop (do not ask clarify spam)
    if (!/[가-힣]{2,}/.test(name) || /원$|복사$|보기$/.test(name)) return null;
    return clarify(name, title, '용량·옵션이 제목에 없어요. 상세 옵션을 알려 주세요.', location);
  }
}

function readyItem(name, quantity, unit, sourceText, location) {
  const n = String(name || '').trim();
  if (!n) return null;
  return {
    name: n,
    quantity: quantity == null ? null : quantity,
    unit: unit || null,
    category: inferCategoryExtended(n),
    location: location || guessLocationFromCategory(inferCategoryExtended(n)),
    status: 'enough',
    sourceText: String(sourceText || '').slice(0, 200),
    needsClarify: false,
  };
}

function clarify(name, sourceText, reason, location) {
  const n = canonicalName(String(name || '상품').trim()) || '상품';
  const category = inferCategoryExtended(n);
  return {
    name: n,
    quantity: null,
    unit: null,
    category,
    location: location || guessLocationFromCategory(category),
    status: 'enough',
    sourceText: String(sourceText || '').slice(0, 200),
    needsClarify: true,
    clarifyReason: reason,
  };
}

function stripToName(s) {
  let t = String(s || '').replace(SELLER_PREFIX, '');
  for (let i = 0; i < 4; i++) {
    const next = t.replace(BRAND_BRACKET, '').replace(EMPTY_BRACKETS, '').trim();
    if (next === t) break;
    t = next;
  }
  return t
    .replace(NAME_NOISE, '')
    .replace(EMPTY_BRACKETS, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[＃#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map marketing names to short fridge names. */
export function canonicalName(name) {
  let n = String(name || '').trim();
  if (!n) return '';
  n = n
    .replace(/^아몬드 후레이크.*시리얼$/u, '아몬드 후레이크')
    .replace(/^아몬드 후레이크 시리얼$/u, '아몬드 후레이크')
    .replace(/후레이크$/u, (m, off, str) => (str.includes('아몬드') ? '아몬드 후레이크' : m));
  if (/아몬드.*후레이크|후레이크.*아몬드/.test(n)) n = '아몬드 후레이크';
  if (/커피믹스|모카골드/.test(n)) n = '커피믹스';
  if (/달걀|계란|특란/.test(n) && !/구운/.test(n)) n = '달걀';
  if (/구운란|구운계란|훈제계란|반숙/.test(n)) n = '구운란';
  if (/전용목장우유|^우유$|목장우유/.test(n)) n = '우유';
  if (/미니\s*단호박|단호박/.test(n)) n = '미니 단호박';
  if (/꿀\s*고구마|호박고구마|베니하루카|고구마/.test(n)) n = '꿀고구마';
  if (/대파/.test(n) && !/나또|낫또|간장/.test(n)) n = '대파';
  if (/당근/.test(n)) n = '당근';
  if (/브로콜리/.test(n)) n = '브로콜리';
  if (/양배추/.test(n) && !/방울/.test(n)) n = '양배추';
  if (/방울양배추/.test(n)) n = '방울양배추';
  if (/참타리/.test(n)) n = '참타리버섯';
  if (/알배기\s*배추|배추/.test(n) && /알배기/.test(n)) n = '알배기배추';
  if (/치즈/.test(n)) n = '치즈';
  if (/오리\s*로스|오리로스/.test(n)) n = '오리로스';
  if (/닭\s*다리살|닭다리살/.test(n)) n = '닭다리살';
  if (/삼겹/.test(n)) n = '삼겹살';
  if (/목살/.test(n)) n = '목살';
  if (/우삼겹|대패/.test(n)) n = '우삼겹';
  if (/떡갈비/.test(n)) n = '떡갈비';
  if (/두부/.test(n) && !/도너츠/.test(n)) n = '두부';
  if (/숙주/.test(n)) n = '숙주';
  if (/나또|낫또/.test(n)) n = '낫또';
  if (/칼국수/.test(n)) n = '칼국수사리';
  if (/사누끼|우동면/.test(n)) n = '우동면';
  if (/진밀면/.test(n)) n = '진밀면';
  if (/밀면/.test(n) && !/진밀면/.test(n)) n = '밀면';
  if (/라면/.test(n)) n = '라면';
  if (/크뽕|크림 짬뽕/.test(n)) n = '크뽕';
  if (/땅콩버터/.test(n)) n = '땅콩버터';
  if (/타피오카/.test(n)) n = '타피오카전분';
  if (/화장지|휴지/.test(n)) n = '화장지';
  if (/칫솔/.test(n)) n = '칫솔';
  if (/트리트먼트/.test(n)) n = '트리트먼트';
  if (/건조기시트|드라이시트|스너글/.test(n)) n = '건조기시트';
  if (/탈취제/.test(n)) n = '탈취제';
  if (/생수|먹는샘물|스파클/.test(n)) n = '생수';
  if (/대추방울토마토|방울토마토/.test(n)) n = '대추방울토마토';
  if (/플레인 요거트|요거트/.test(n) && !/그릭/.test(n)) n = '플레인 요거트';
  if (/그릭요거트|그릭 요거트/.test(n)) n = '그릭요거트';
  if (/생크림/.test(n)) n = '생크림';
  if (/시금치/.test(n)) n = '시금치';
  if (/애플민트/.test(n)) n = '애플민트';
  if (/바질/.test(n)) n = '바질';
  if (/넛맥|너트멕/.test(n)) n = '넛맥';
  if (/참기름/.test(n)) n = '참기름';
  if (/불닭소스|까르보불닭/.test(n)) n = '까르보불닭소스';
  if (/야채찜/.test(n)) n = '야채찜';
  if (/감자/.test(n)) n = '감자';
  // Hangul is not a JS \b word char — match 무 by itself after stripping junk brackets.
  {
    const bare = n.replace(/[\[\]\s]/g, '');
    if (bare === '무' || /(^|\s)무(\s|$)/.test(n)) n = '무';
  }
  if (/가지/.test(n)) n = '가지';
  if (/감귤|귤/.test(n)) n = '감귤';
  if (/사과/.test(n)) n = '사과';
  if (/옥수수|찰옥수수/.test(n)) n = '옥수수';
  if (/로메인/.test(n)) n = '로메인';
  if (/바나나/.test(n)) n = '바나나';
  if (/우베라떼/.test(n)) n = '우베라떼';
  if (/양파/.test(n)) n = '양파';
  return n.replace(/\s+/g, ' ').trim();
}

function normalizeUnit(u) {
  const x = String(u || '').toLowerCase();
  if (x === '리터' || x === 'l') return 'L';
  if (x === 'ml' || x === '㎖') return 'ml';
  return u;
}

function guessLocationFromTitle(title) {
  if (/냉동|급냉|IQF/.test(title)) return 'freezer';
  if (/냉장/.test(title)) return 'fridge';
  if (/화장지|휴지|칫솔|트리트먼트|탈취제|건조기시트|세제/.test(title)) return 'storage';
  if (/생수|시리얼|후레이크|커피|전분|소스|기름|넛맥/.test(title)) return 'pantry';
  return null;
}

function guessLocationFromCategory(category) {
  if (category === 'household') return 'storage';
  if (category === 'snack') return 'pantry';
  return 'fridge';
}

function inferCategoryExtended(name) {
  if (/화장지|칫솔|트리트먼트|탈취제|건조기시트|세제|휴지/.test(name)) return 'household';
  if (/후레이크|시리얼|과자|초콜릿|땅콩버터/.test(name)) return 'snack';
  return inferCategory(name);
}

/** Apply a clarify answer (e.g. "1kg" or "물냉") onto a needsClarify item. */
export function applyClarifyAnswer(item, answer) {
  const a = String(answer || '').trim();
  if (!item) return null;
  if (!a) return { ...item };

  const wv = a.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|L|개|구|봉|롤|매|입|인분)$/i);
  if (wv) {
    const unit = wv[2] === '입' ? '개' : normalizeUnit(wv[2]);
    return {
      ...item,
      quantity: Number(wv[1]),
      unit,
      needsClarify: false,
      clarifyReason: undefined,
      name: item.name,
    };
  }

  // Free text option label — keep as note-ish name refinement if short
  if (a.length <= 40) {
    const merged = /냉|비빔|물냉|비냉|맛|종/.test(a) ? `${item.name}(${a})` : item.name;
    return {
      ...item,
      name: canonicalName(merged) || item.name,
      quantity: item.quantity ?? 1,
      unit: item.unit || '개',
      needsClarify: false,
      clarifyReason: undefined,
      note: a,
    };
  }
  return { ...item, needsClarify: true, clarifyReason: '답을 짧게 적어 주세요. 예: 1kg' };
}

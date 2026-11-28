// Everything Manage Pulse knows about ISACO «کسب‌وکار» (b2b.isaco.ir) lives in this file.
// Source: analysis of one real browser recording (HAR, 1405/09/02, client 3.3.1) supplied by
// the owner; no real data is in the repository. When کسب‌وکار changes its site, start here
// (docs/MANAGE_PULSE_FA.md, «اگر کسب‌وکار عوض شد»).

export const KASB_ORIGIN = 'https://b2b.isaco.ir';

/** JSON API paths under /api/ (all POST with an encrypted body, except Sec/Code). */
export const KASB_PATHS = {
  captcha: 'Sec/GetCapcha',
  login: 'Sec/Login/v2',
  codes: 'Sec/Code',
  cards: 'Srv/rcpt/RepairCard/Drcds/q',
  defects: 'Srv/rcpt/RepairCard/Drefs/q',
  repairs: 'Srv/rcpt/RepairCard/Drers/q',
  parts: 'Srv/rcpt/RepairCard/Dreps/q',
  repairCase: 'Srv/RepairCase/RepairCase',
  /** Warehouses of the dealership: POST with an EMPTY, unencrypted body; encrypted answer [{value, text}]. */
  warehouses: 'War/General/ScusStks',
  /**
   * Stock report «گزارش موجودی انبار» (owner's second recording, 1405/09/02): encrypted request
   * {CurYear, DssdSsd, WgdmGdm: '', TypeGhete: ''}; the answer is the FILE itself
   * (application/vnd.ms-excel, an HTML table — byte for byte what staff download by hand).
   */
  stock: 'War/Reports/StkStock',
  /**
   * «گزارش امداد ویژه» (owner's recording, 1405/09/03): a report the server builds in the background.
   * The same request is sent again until `reportStatus` is «result ready»; then `Data` is the
   * SpreadsheetML text, byte for byte the RepEmdadVijeh.xls staff download. Statuses: «just started»,
   * «running», «result ready», «expired», «error occurred».
   */
  emdadReport: 'Srv/wrh/RepEmdadVijeh/q',
  /**
   * «لیست نوبت پذیرش»: the site asks for a one-time report address (b2brep.isaco.ir) and opens it;
   * with T = 3 that address answers with the Excel file itself. The trailing slash is the site's.
   */
  reportUrl: 'Srv/Sec/Public/GetReportUrl/',
} as const;
export type KasbPath = (typeof KASB_PATHS)[keyof typeof KASB_PATHS];

/**
 * The read-only allowlist (spec section 26): any other request is refused inside the client
 * before it leaves the server. None of these paths records, edits or deletes anything.
 */
export const KASB_ALLOWED_API: ReadonlyMap<string, 'GET' | 'POST'> = new Map<string, 'GET' | 'POST'>([
  [KASB_PATHS.captcha, 'POST'],
  [KASB_PATHS.login, 'POST'],
  [KASB_PATHS.codes, 'GET'],
  [KASB_PATHS.cards, 'POST'],
  [KASB_PATHS.defects, 'POST'],
  [KASB_PATHS.repairs, 'POST'],
  [KASB_PATHS.parts, 'POST'],
  [KASB_PATHS.repairCase, 'POST'],
  [KASB_PATHS.warehouses, 'POST'],
  [KASB_PATHS.stock, 'POST'],
  [KASB_PATHS.emdadReport, 'POST'],
  [KASB_PATHS.reportUrl, 'POST'],
]);
/** Report server of کسب‌وکار; only the appointment list is read from it (GET, one-time address). */
export const KASB_REPORT_ORIGIN = 'https://b2brep.isaco.ir';
export const KASB_APPOINTMENT_REPORT = 'Srv/afs/FncGetNodDturRep';
const APPOINTMENT_REPORT_PATH = `/Report/Show/${KASB_APPOINTMENT_REPORT}`;
/**
 * A report address returned by GetReportUrl is followed only if it is the appointment report on the
 * report server (or, in development and tests, on the configured کسب‌وکار origin) with one `f` token.
 */
export function allowedReportUrl(origin: string, raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const host = url.origin === KASB_REPORT_ORIGIN || url.origin === new URL(origin).origin;
  if (!host || url.pathname !== APPOINTMENT_REPORT_PATH || url.hash || !/^\?f=[0-9A-Fa-f]{16,1024}$/.test(url.search)) return null;
  return url;
}

/** Static files of the site, read with GET only (keys and client version). */
export const KASB_ALLOWED_STATIC: readonly RegExp[] = [/^\/home$/, /^\/version\.txt$/, /^\/static\/js\/main\.[A-Za-z0-9]+\.chunk\.js$/];

/** Login answer: Data.status. */
export const LOGIN_STATUS_OK = 2;
export const LOGIN_STATUS_CHANGE_PASSWORD = 1;

/**
 * How the answer to a captcha image is sent. Not visible in the recording (no captcha was asked);
 * confirm it from `submitform` in main.*.chunk.js at the first captcha and adjust only here.
 */
export function captchaFields(_answer: string | null): Record<string, string> {
  // The captcha answer is not a login field: it becomes the HashData suffix (see hashData).
  return {};
}

/**
 * The real client (Services in main.*.chunk.js, confirmed against the owner's recordings,
 * 2026-11-23) does NOT seal the payload itself: for every service that is not marked FormData it
 * seals `{ HashData: base64(JSON.stringify(payload)) + suffix }`, where `suffix` is the value it
 * keeps in localStorage «browser»: base64 of the last four digits of Sec/GetCapcha's ServerTime,
 * or base64 of the captcha answer when a captcha was shown. Sending the bare payload is answered
 * with MessageCode 99999. Sec/GetCapcha itself is sent bare ({"Lng":"fa"}).
 */
/** Changes whenever the way Pulse talks to کسب‌وکار changes; shown in run details to prove which worker code ran. */
export const PULSE_PROTOCOL_REVISION = 'card-search 2026-11-24';

export function hashData(payload: unknown, browser: string): { HashData: string } {
  return { HashData: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') + Buffer.from(browser, 'utf8').toString('base64') };
}

/** Value the site keeps as «browser» when no captcha is shown. */
export function browserFromServerTime(serverTime: unknown): string {
  const t = String(serverTime ?? '');
  return t.slice(-4);
}

/** Domain of the admission status texts in Sec/Code. */
export const STATUS_DOMAIN = 'CAR_STATE_REC';

/** Columns of the admission list (Drcds/q). Always mapped by name, never by position. */
export const CARD = {
  rcd: 'DrcdRcd',
  admissionNo: 'DrcdDealerSeq',
  docNo: 'DrcdDocNo',
  dealer: 'DrcdScusCus',
  rcptDate: 'DrcdRcptDate',
  rcptTime: 'DrcdRcptTime',
  insDate: 'DrcdInsDte',
  updDate: 'DrcdUpdDte',
  exitEstDate: 'DrcdExitDteEstim',
  exitEstTime: 'DrcdExitTimeEstim',
  exitDate: 'DrcdExtDte',
  exitTime: 'DrcdExtTim',
  status: 'DrcdCarSt',
  warrantyStatus: 'DrcdGarStatus',
  recType: 'DrcdRecType',
  entryType: 'DrcdEntryType',
  accident: 'DrcdAccident',
  goldType: 'DrcdTypeCardGold',
  goldId: 'DrcdGoldId',
  goldExpires: 'DrcdDteExpGld',
  chassis: 'DrcdGchsChs',
  vin: 'GchsVin',
  engineNo: 'DrcdEngineNo',
  productCode: 'GctpCtp',
  productName: 'GctpDesc',
  modelCode: 'WvmdVmd',
  modelName: 'WvmdDes',
  color: 'GcolDesc',
  deliveredOn: 'GchsDeliveDate',
  entranceKm: 'DrcdEntranceKm',
  plateRegion: 'DrcdPlateReg',
  plateSection: 'DrcdPlateSec',
  plateLetter: 'DrcdPlateAlph',
  plateThree: 'DrcdPlateThr',
  customerName: 'DrcdCustName',
  nationalId: 'DrcdOwnerNatinalIde',
  mobile: 'DrcdOwnerMob',
  phone: 'DrcdOwnerTel',
  address: 'DrcdOwnerAdd',
  delivererName: 'DrcdDeliverName',
  delivererMobile: 'DrcdDeliverMob',
  station: 'DssdDesc',
  receptionist: 'NdRcptFullName',
  costEstimate: 'DrcdCostEstim',
  finalCost: 'DrcdFinalCusCost',
} as const;
/** Free-text description of the admission: the column name was not in the recording; the first present one is used. */
export const CARD_DESCRIPTION_COLUMNS = ['DrcdDesc', 'DrcdDescription', 'DrcdComment', 'DrcdRem'] as const;

export const PART = {
  line: 'DrepRep',
  code: 'DrepWgdsGds',
  qty: 'DrepQty',
  finalQty: 'DrepFinalQty',
  unitPrice: 'DrepDUnitPrice',
  state: 'DrepState',
  specialAid: 'DrepDEmdadFlg',
  warranty: 'DrepDGar',
  repairLine: 'DrepDrerRer',
  rejectReason: 'DrepDcarCar',
  seq: 'DrepSeq',
} as const;
/** Part name: not in the (empty) recorded answer; the first present column is used, otherwise the code is shown. */
export const PART_NAME_COLUMNS = ['WgdsDesc', 'GdsDesc', 'DrepDesc', 'WgdsName', 'DrepWgdsDesc'] as const;

export const REPAIR = {
  line: 'DrerRer',
  code: 'DrerGrprRpr',
  description: 'DrerDesc',
  state: 'DrerState',
  finalPrice: 'DrerFinalPrice',
  warranty: 'DrerIsGar',
  defectLine: 'DrerDrefRef',
} as const;

/**
 * Text columns that come with every line in the real answers (seen by Pulse on staging, 2026-11-28; H4).
 * The stored code columns above stay; these carry the Persian text کسب‌وکار shows beside them.
 */
export const KASB_LINE_TEXT = {
  /** Labour name from the labour catalogue (e.g. «تعویض روغن موتور»). */
  repairName: 'GrprDesc',
  /** Defect group of the labour line: «910100 - سرویس سریع (کوئیک سرویس)». */
  repairGroup: 'VDesc',
  /** State text of the labour line: «نهایی», «پیش نویس», «امداد ویژه», «عدم تمایل به انجام تعمیر» … */
  repairState: 'VDrerStateDesc',
  /** Part description from the parts catalogue. */
  partName: 'WgdsFarDes',
} as const;

export const DEFECT = {
  line: 'DrefRef',
  customer: 'DrefCustomerExp',
  expert: 'DrefExpertExp',
  state: 'DrefState',
  type: 'DrefType',
} as const;

/** Sec/Code columns (names confirmed at the first read; candidates in order). */
export const CODE_DOMAIN_COLUMNS = ['RvDomain', 'Domain'] as const;
export const CODE_VALUE_COLUMNS = ['RvLowValue', 'LowValue'] as const;
export const CODE_TEXT_COLUMNS = ['RvMeaning', 'RvAbbreviation', 'RvDesc', 'Meaning', 'Desc'] as const;

/**
 * An admission leaves «open» when کسب‌وکار shows its exit (release) date, or when its official
 * status text says it is released, closed or cancelled.
 */
export const CLOSED_STATUS_RE = /ترخیص|خروج|خارج\s*شده|بسته|ابطال|لغو|تحویل\s*شد/;

/** A normal desktop browser (spec section 26: no bot user agent). */
export const KASB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

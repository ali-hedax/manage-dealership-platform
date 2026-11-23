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
]);
/** Static files of the site, read with GET only (keys and client version). */
export const KASB_ALLOWED_STATIC: readonly RegExp[] = [/^\/home$/, /^\/version\.txt$/, /^\/static\/js\/main\.[A-Za-z0-9]+\.chunk\.js$/];

/** Login answer: Data.status. */
export const LOGIN_STATUS_OK = 2;
export const LOGIN_STATUS_CHANGE_PASSWORD = 1;

/**
 * How the answer to a captcha image is sent. Not visible in the recording (no captcha was asked);
 * confirm it from `submitform` in main.*.chunk.js at the first captcha and adjust only here.
 */
export function captchaFields(answer: string | null): Record<string, string> {
  return answer ? { Capcha: answer } : {};
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

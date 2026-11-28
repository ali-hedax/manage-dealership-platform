// Owner's rule (2026-11-28, data foundation H3/S09): every service — ۵۰۰۰، ۱۰۰۰۰، ۲۰۰۰۰، «تعویض روغن و
// فیلتر» and «سرویس سریع» — is an oil change; so is a card that used engine oil or an oil filter. A car
// may be both an oil change and a repair. Names are compared after normalizePersianJobText.
export const JOB_CLASSIFICATION_CONFIG = {
  periodicServiceNames: [
    'سرویس 5000',
    'سرویس 10000',
    'سرویس 20000',
    'تعویض روغن',
    'روغن و فیلتر',
    'سرویس سریع',
    'کوئیک سرویس',
  ],
  /**
   * Kilometre marks of a periodic service: «سرویس» followed, within three words, by one of them
   * («سرویس دوره‌ای ۱۰٬۰۰۰ کیلومتری» counts; «سرویس ۲۵۰۰۰» does not).
   */
  periodicServiceKm: ['5000', '10000', '20000'],
  /** «سرویس سریع»: from the labour name, or from «سالن تعمیرات» once its column is confirmed. */
  quickServiceNames: ['سرویس سریع', 'کوئیک سرویس'],
  oilChangePartNames: ['روغن موتور', 'فیلتر روغن'],
  excludedOilNames: ['روغن گیربکس', 'روغن ترمز', 'روغن هیدرولیک'],
} as const;

/**
 * Codes that decide the job (owner, H4 part 1, 2026-11-28): labour names were often missing, so the
 * codes come first and the names only add to them. Defaults until the owner or system administrator
 * saves other lists in the reception settings. Only exact codes: the prefixes 07707… and 12402… were
 * not confirmed in a parts catalogue (12402… also holds brake and gearbox oil filters in the stock list).
 */
export const DEFAULT_JOB_CODES = {
  /** Labour: engine oil change, oil filter change, periodic service inspection (mechanical, electrical). */
  serviceLabourCodes: ['10165C0', '10145C0', '91117S1', '91117S2'],
  /** Defect group of the labour line: «سرویس سریع (کوئیک سرویس)». Every line under it is service. */
  quickServiceGroups: ['910100'],
  /** Parts: engine oil and oil filter (base part number, the first eight characters). */
  oilPartCodes: ['07707016', '07707073', '07707076', '07707089', '12402027', '12402043', '12402008'],
} as const;

/** Labour state in کسب‌وکار (VDrerStateDesc) that means the customer refused the work: shown apart, never counted as work. */
export const DECLINED_LABOUR_STATES = ['عدم تمایل به انجام تعمیر'] as const;

/**
 * Labour state «امداد ویژه»: the work waits for a special-aid part, so it is not technical repair done
 * (owner, 2026-11-28, H4 decision 1). Counted apart; the car's night-list reason is «منتظر امداد ویژه».
 */
export const SPECIAL_AID_LABOUR_STATES = ['امداد ویژه'] as const;

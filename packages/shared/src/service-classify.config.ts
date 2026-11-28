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

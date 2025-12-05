/**
 * Phone number utilities - ported from guestResponse.gs
 */

/**
 * Canonicalize phone number into multiple comparable tokens
 * @param {string} phone - Raw phone number input
 * @returns {Object} - { wa, e164, digits, last10 }
 */
export function canonPhoneTokens(phone) {
  let raw = String(phone || '').trim().replace(/\s+/g, '');
  let noPrefix = raw.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  
  if (!noPrefix) {
    return { wa: '', e164: '', digits: '', last10: '' };
  }
  
  // Handle international format variations
  if (noPrefix.startsWith('00')) {
    noPrefix = '+' + noPrefix.slice(2);
  }
  if (!noPrefix.startsWith('+') && noPrefix.length >= 10) {
    noPrefix = '+' + noPrefix;
  }
  
  const e164 = noPrefix;
  const wa = 'whatsapp:' + e164;
  const digits = e164.replace(/[^\d]/g, '');
  const last10 = digits.slice(-10);
  
  return { wa, e164, digits, last10 };
}

/**
 * Normalize phone to WhatsApp format (whatsapp:+E164)
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized WhatsApp number
 */
export function normalizeWhatsAppPhone(phone) {
  const tokens = canonPhoneTokens(phone);
  return tokens.wa || '';
}

/**
 * Normalize phone to E.164 format (+country_code + number)
 * @param {string} phone - Raw phone number
 * @returns {string} - E.164 formatted number
 */
export function normalizeE164(phone) {
  const tokens = canonPhoneTokens(phone);
  return tokens.e164 || '';
}

/**
 * Check if two phone numbers match (fuzzy matching)
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if numbers match
 */
export function phonesMatch(phone1, phone2) {
  const a = canonPhoneTokens(phone1);
  const b = canonPhoneTokens(phone2);
  
  if (!a.digits || !b.digits) return false;
  
  // Exact matches
  if (a.wa === b.wa || a.e164 === b.e164 || a.digits === b.digits) {
    return true;
  }
  
  // Trailing match (handles +31 vs 0-prefixed local)
  const minLen = 9;
  if (a.digits.length >= minLen && b.digits.length >= minLen) {
    if (a.digits.endsWith(b.digits) || b.digits.endsWith(a.digits)) {
      return true;
    }
    if (a.digits.slice(-minLen) === b.digits.slice(-minLen)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Format phone for WhatsApp API (ensure whatsapp: prefix)
 * @param {string} from - From number (to check format)
 * @param {string} to - To number to format
 * @returns {string} - Formatted number
 */
export function formatForWhatsApp(from, to) {
  if (/^whatsapp:/i.test(from) && !/^whatsapp:/i.test(to)) {
    return 'whatsapp:' + to.replace(/^whatsapp:/i, '').trim();
  }
  return to;
}

export default {
  canonPhoneTokens,
  normalizeWhatsAppPhone,
  normalizeE164,
  phonesMatch,
  formatForWhatsApp,
};


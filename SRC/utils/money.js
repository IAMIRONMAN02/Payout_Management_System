/**
 * All monetary values in the domain layer are stored as integer paise
 * (1 INR = 100 paise) to avoid floating point rounding errors that plague
 * naive `earning * 0.10` arithmetic. Callers at the API boundary convert
 * rupees (float/number from JSON) <-> paise (integer) using the helpers
 * below.
 */

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Math.round(paise) / 100;

/** 10% advance, rounded down (bank-friendly: never advance more than owed). */
const computeAdvance = (earningPaise) => Math.floor(earningPaise * 0.10);

module.exports = { toPaise, toRupees, computeAdvance };

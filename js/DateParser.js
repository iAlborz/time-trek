// DateParser.js — Date parsing with deep-time support
// Returns TimelineDate objects: { date: Date|null, dayOffset: number }
// dayOffset = days from referenceDate (typically today), usable for positioning

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

// Deep-time regex patterns
const DEEP_TIME_PATTERNS = [
    // "4.5 BYA" or "4.5 bya" — billions of years ago
    { regex: /^([\d.]+)\s*(BYA|bya|Bya)$/, handler: (m) => -parseFloat(m[1]) * 1e9 * DAYS_PER_YEAR },
    // "65 MYA" or "65 mya" — millions of years ago
    { regex: /^([\d.]+)\s*(MYA|mya|Mya)$/, handler: (m) => -parseFloat(m[1]) * 1e6 * DAYS_PER_YEAR },
    // "10 KYA" or "10 kya" — thousands of years ago
    { regex: /^([\d.]+)\s*(KYA|kya|Kya)$/, handler: (m) => -parseFloat(m[1]) * 1e3 * DAYS_PER_YEAR },
    // "3000 BC" or "3000 BCE"
    { regex: /^(\d+)\s*(BC|BCE|bc|bce)$/, handler: (m, refYear) => -(parseInt(m[1]) + refYear) * DAYS_PER_YEAR },
    // "2025 AD" or "2025 CE"
    { regex: /^(\d+)\s*(AD|CE|ad|ce)$/, handler: (m, refYear) => (parseInt(m[1]) - refYear) * DAYS_PER_YEAR },
];

/**
 * Parse a date string into a TimelineDate object.
 * @param {string} dateString - The date string to parse
 * @param {Date} [referenceDate] - Reference date for offset calculation (defaults to now)
 * @returns {{ date: Date|null, dayOffset: number }|null} - Parsed date or null
 */
export function parseDate(dateString, referenceDate) {
    if (!dateString || !dateString.trim()) return null;

    const trimmed = dateString.trim();
    const ref = referenceDate || new Date();
    const refTime = ref.getTime();
    const refYear = ref.getFullYear();

    // 1. Try deep-time formats first (they can't be parsed by Date constructor)
    for (const pattern of DEEP_TIME_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
            const dayOffset = pattern.handler(match, refYear);
            return { date: null, dayOffset };
        }
    }

    // 2. Try standard Date constructor
    let date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
        return {
            date,
            dayOffset: (date.getTime() - refTime) / MS_PER_DAY
        };
    }

    // 3. Try MM/DD/YYYY format
    const mmddyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
        date = new Date(parseInt(mmddyyyy[3]), parseInt(mmddyyyy[1]) - 1, parseInt(mmddyyyy[2]));
        if (!isNaN(date.getTime())) {
            return {
                date,
                dayOffset: (date.getTime() - refTime) / MS_PER_DAY
            };
        }
    }

    // 4. Try DD-MM-YYYY format (dashes to disambiguate from MM/DD/YYYY)
    const ddmmyyyy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
        date = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
        if (!isNaN(date.getTime())) {
            return {
                date,
                dayOffset: (date.getTime() - refTime) / MS_PER_DAY
            };
        }
    }

    // 5. Try YYYY-MM-DD format (ISO-like)
    const yyyymmdd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yyyymmdd) {
        date = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
        if (!isNaN(date.getTime())) {
            return {
                date,
                dayOffset: (date.getTime() - refTime) / MS_PER_DAY
            };
        }
    }

    // 6. Try plain year: "2025", "-500" (negative year = BC)
    const plainYear = trimmed.match(/^(-?\d+)$/);
    if (plainYear) {
        const year = parseInt(plainYear[1]);
        const dayOffset = (year - refYear) * DAYS_PER_YEAR;
        // Try to create a Date object if within range
        if (Math.abs(year) < 250000) {
            try {
                date = new Date(year, 0, 1);
                if (year >= 0 && year < 100) date.setFullYear(year);
                if (!isNaN(date.getTime())) {
                    return { date, dayOffset: (date.getTime() - refTime) / MS_PER_DAY };
                }
            } catch (_) { /* fall through */ }
        }
        return { date: null, dayOffset };
    }

    console.warn(`Could not parse date: ${dateString}`);
    return null;
}

export { MS_PER_DAY, DAYS_PER_YEAR };

// TimeScale.js — Data-driven scale definitions replacing all switch statements

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
}

function formatYearBC(year) {
    if (year <= 0) return year === 0 ? '0' : `${Math.abs(year)} BC`;
    return year.toString();
}

function dayOfYearToMonthDay(dayOfYear) {
    let remaining = Math.max(0, dayOfYear);
    for (let i = 0; i < 12; i++) {
        if (remaining < MONTH_DAYS[i]) {
            return { month: i, day: remaining + 1 };
        }
        remaining -= MONTH_DAYS[i];
    }
    return { month: 11, day: 31 };
}

function yearFractionToMonthDay(yearFraction) {
    const dayOfYear = Math.floor(Math.abs(yearFraction) * 365);
    return dayOfYearToMonthDay(dayOfYear);
}

// Format a full date string with optional hour for center display
function formatFullDate(year, month, day, hourStr) {
    const monthName = MONTH_NAMES_LONG[month] || 'January';
    const dayOrd = `${day}${getOrdinalSuffix(day)}`;
    const yearStr = formatYearBC(year);
    const hourPart = hourStr ? `, ${hourStr}` : '';
    if (year <= 0) {
        return `${monthName} ${dayOrd}, ${yearStr}${hourPart}`;
    }
    return `${monthName} ${dayOrd}, ${year}${hourPart}`;
}

export class TimeScale {
    constructor({ unit, days, label, stepYears, stepDays, isLargeScale,
                  alignDate, alignDays, incrementDate, formatLabel, formatCenter }) {
        this.unit = unit;
        this.days = days;
        this.label = label;
        this.stepYears = stepYears || null;
        this.stepDays = stepDays || null;
        this.isLargeScale = isLargeScale || false;
        this.alignDate = alignDate || (() => {});
        this.alignDays = alignDays || ((d) => d);
        this.incrementDate = incrementDate || (() => {});
        this.formatLabel = formatLabel || (() => '');
        this.formatCenter = formatCenter || (() => '');
    }
}

// ─── Built-in scales ───────────────────────────────────────────────────────────

export const DEFAULT_SCALES = [
    // ── Hour ──
    new TimeScale({
        unit: 'hour',
        days: 1 / 24,
        label: 'H',
        stepDays: 1 / 24,
        isLargeScale: false,
        alignDate(date) {
            date.setMinutes(0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days * 24) / 24;
        },
        incrementDate(date) {
            date.setHours(date.getHours() + 1);
        },
        formatLabel(date, actualYear) {
            try {
                if (date && actualYear === null) {
                    return date.toLocaleTimeString([], { hour: 'numeric' });
                }
            } catch (_) { /* fall through */ }
            const hour = date ? date.getHours() : 0;
            const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
            const ampm = hour < 12 ? 'AM' : 'PM';
            return `${hour12} ${ampm}`;
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            let month, day, hourStr;
            if (date && actualYear === null) {
                try {
                    month = date.getMonth();
                    day = date.getDate();
                    hourStr = date.toLocaleTimeString([], { hour: 'numeric' });
                } catch (_) {
                    month = 0; day = 1; hourStr = '12 AM';
                }
            } else {
                month = actualMonth !== null ? actualMonth : 0;
                day = actualDay !== null ? actualDay : 1;
                if (date) {
                    try { hourStr = date.toLocaleTimeString([], { hour: 'numeric' }); }
                    catch (_) {
                        const h = date.getHours();
                        const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
                        hourStr = `${h12} ${h < 12 ? 'AM' : 'PM'}`;
                    }
                } else {
                    hourStr = '12 AM';
                }
            }
            return formatFullDate(year, month, day, hourStr);
        }
    }),

    // ── Day ──
    new TimeScale({
        unit: 'day',
        days: 1,
        label: 'D',
        stepDays: 1,
        isLargeScale: false,
        alignDate(date) {
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days);
        },
        incrementDate(date) {
            date.setDate(date.getDate() + 1);
        },
        formatLabel(date, actualYear) {
            try {
                if (date && actualYear === null) {
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
            } catch (_) { /* fall through */ }
            if (date) {
                return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`;
            }
            return 'Jan 1';
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            let month, day;
            if (date && actualYear === null) {
                month = date.getMonth();
                day = date.getDate();
            } else {
                month = actualMonth !== null ? actualMonth : 0;
                day = actualDay !== null ? actualDay : 1;
            }
            return formatFullDate(year, month, day, null);
        }
    }),

    // ── Week (NEW) ──
    new TimeScale({
        unit: 'week',
        days: 7,
        label: 'W',
        stepDays: 7,
        isLargeScale: false,
        alignDate(date) {
            date.setHours(0, 0, 0, 0);
            // Align to Monday (ISO week)
            const dayOfWeek = date.getDay();
            const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
            date.setDate(date.getDate() + diff);
        },
        alignDays(days) {
            return Math.floor(days / 7) * 7;
        },
        incrementDate(date) {
            date.setDate(date.getDate() + 7);
        },
        formatLabel(date, actualYear) {
            try {
                if (date && actualYear === null) {
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
            } catch (_) { /* fall through */ }
            if (date) {
                return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`;
            }
            return 'Jan 1';
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            let month, day;
            if (date && actualYear === null) {
                month = date.getMonth();
                day = date.getDate();
            } else {
                month = actualMonth !== null ? actualMonth : 0;
                day = actualDay !== null ? actualDay : 1;
            }
            return formatFullDate(year, month, day, null);
        }
    }),

    // ── Month ──
    new TimeScale({
        unit: 'month',
        days: 30.4375, // 365.25/12
        label: 'M',
        stepDays: null, // variable-length; uses special generation
        isLargeScale: false,
        alignDate(date) {
            date.setDate(1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return days; // handled specially in marker generation
        },
        incrementDate(date) {
            date.setMonth(date.getMonth() + 1);
        },
        formatLabel(date, actualYear) {
            try {
                if (date && actualYear === null) {
                    return date.toLocaleDateString([], { month: 'short' });
                }
            } catch (_) { /* fall through */ }
            if (date) {
                return MONTH_NAMES_SHORT[date.getMonth()] || 'Jan';
            }
            return 'Jan';
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            let month, day;
            if (date && actualYear === null) {
                try {
                    month = date.getMonth();
                    day = date.getDate();
                } catch (_) { month = 0; day = 1; }
            } else {
                month = actualMonth !== null ? actualMonth : 0;
                day = actualDay !== null ? actualDay : 1;
            }
            return formatFullDate(year, month, day, null);
        }
    }),

    // ── Quarter (NEW) ──
    new TimeScale({
        unit: 'quarter',
        days: 91.3125, // 365.25/4
        label: 'Q',
        stepDays: null, // uses month-based generation
        isLargeScale: false,
        alignDate(date) {
            const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
            date.setMonth(quarterMonth, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return days; // handled specially
        },
        incrementDate(date) {
            date.setMonth(date.getMonth() + 3);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            const month = date ? date.getMonth() : 0;
            const q = Math.floor(month / 3) + 1;
            return `Q${q} ${formatYearBC(year)}`;
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            const month = actualMonth !== null ? actualMonth : (date ? date.getMonth() : 0);
            const q = Math.floor(month / 3) + 1;
            return `Q${q}, ${formatYearBC(year)}`;
        }
    }),

    // ── Year ──
    new TimeScale({
        unit: 'year',
        days: 365.25,
        label: 'Y',
        stepYears: 1,
        isLargeScale: false,
        alignDate(date) {
            date.setMonth(0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 365.25) * 365.25;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 1);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            let month;
            if (date && actualYear === null) {
                try { month = date.getMonth(); } catch (_) { month = 0; }
            } else {
                month = actualMonth !== null ? actualMonth : 0;
            }
            return `${MONTH_NAMES_LONG[month]}, ${formatYearBC(year)}`;
        }
    }),

    // ── Decade ──
    new TimeScale({
        unit: 'decade',
        days: 3652.5,
        label: '10Y',
        stepYears: 10,
        isLargeScale: false,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 10) * 10, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 3652.5) * 3652.5;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 10);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            const decadeYear = Math.floor(year / 10) * 10;
            return formatYearBC(decadeYear);
        },
        formatCenter(date, actualYear, actualMonth, actualDay) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── Century ──
    new TimeScale({
        unit: 'century',
        days: 36525,
        label: '100Y',
        stepYears: 100,
        isLargeScale: false,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 100) * 100, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 36525) * 36525;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 100);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            const centuryYear = Math.floor(year / 100) * 100;
            return formatYearBC(centuryYear);
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── Millennium ──
    new TimeScale({
        unit: 'millennium',
        days: 365250,
        label: '1KY',
        stepYears: 1000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 1000) * 1000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 365250) * 365250;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 1000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            const millenniumYear = Math.floor(year / 1000) * 1000;
            return formatYearBC(millenniumYear);
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── 10K Years ──
    new TimeScale({
        unit: 'ten-thousand',
        days: 3652500,
        label: '10KY',
        stepYears: 10000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 10000) * 10000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 3652500) * 3652500;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 10000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000)}K BC`;
            return `${year / 1000}K`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── 100K Years ──
    new TimeScale({
        unit: 'hundred-thousand',
        days: 36525000,
        label: '100KY',
        stepYears: 100000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 100000) * 100000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 36525000) * 36525000;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 100000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000)}K BC`;
            return `${year / 1000}K`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── Million Years ──
    new TimeScale({
        unit: 'million',
        days: 365250000,
        label: '1MY',
        stepYears: 1000000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 1000000) * 1000000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 365250000) * 365250000;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 1000000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000000)}M BC`;
            return `${year / 1000000}M`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── 10 Million Years ──
    new TimeScale({
        unit: 'ten-million',
        days: 3652500000,
        label: '10MY',
        stepYears: 10000000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 10000000) * 10000000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 3652500000) * 3652500000;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 10000000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000000)}M BC`;
            return `${year / 1000000}M`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── 100 Million Years ──
    new TimeScale({
        unit: 'hundred-million',
        days: 36525000000,
        label: '100MY',
        stepYears: 100000000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 100000000) * 100000000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 36525000000) * 36525000000;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 100000000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000000)}M BC`;
            return `${year / 1000000}M`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),

    // ── Billion Years ──
    new TimeScale({
        unit: 'billion',
        days: 365250000000,
        label: '1BY',
        stepYears: 1000000000,
        isLargeScale: true,
        alignDate(date) {
            date.setFullYear(Math.floor(date.getFullYear() / 1000000000) * 1000000000, 0, 1);
            date.setHours(0, 0, 0, 0);
        },
        alignDays(days) {
            return Math.floor(days / 365250000000) * 365250000000;
        },
        incrementDate(date) {
            date.setFullYear(date.getFullYear() + 1000000000);
        },
        formatLabel(date, actualYear) {
            const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
            if (year <= 0) return year === 0 ? '0' : `${Math.abs(year / 1000000000)}B BC`;
            return `${year / 1000000000}B`;
        },
        formatCenter(date, actualYear) {
            const year = actualYear !== null ? Math.floor(actualYear) : (date ? date.getFullYear() : 0);
            return formatYearBC(year);
        }
    }),
];

// Utility exports used by other modules
export { MONTH_NAMES_SHORT, MONTH_NAMES_LONG, MONTH_DAYS, getOrdinalSuffix, formatYearBC, dayOfYearToMonthDay, yearFractionToMonthDay };

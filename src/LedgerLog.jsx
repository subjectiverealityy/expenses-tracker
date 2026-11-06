import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Search, Check, Delete, Plus, Minus, ChevronLeft, ChevronRight, Calendar, Ban, ArrowLeftRight, Settings, Pencil, Trash2, X, Download, Upload, AlertTriangle, RotateCcw, CalendarDays, CalendarRange, CalendarSearch, ArrowUp } from 'lucide-react';

// Where feedback emails are sent. Set this to your real address.
const FEEDBACK_EMAIL = 'oge.o.onuora@gmail.com';

const CURRENCIES = [
  // African currencies first
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  // Others
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
];
const currencyOf = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

// Intl formatters are slow to create, so build them once and reuse.
const NUM_FMT = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
const DAY_FMT = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
const MONTH_YEAR_FMT = new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' });
const MONTH_FMT = new Intl.DateTimeFormat('en-NG', { month: 'long' });

const fmt = (n) => NUM_FMT.format(Number(n || 0));

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabelOf = (d) => MONTH_YEAR_FMT.format(d);

const dayLabelOf = (d) => {
  const key = d.toDateString();
  const today = new Date();
  if (key === today.toDateString()) return 'Today';
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (key === yest.toDateString()) return 'Yesterday';
  return DAY_FMT.format(d);
};

// Roll the (already nullified-free) daily buckets up into larger periods.
const rollupOf = (dailyBuckets, keyFn) => {
  const map = new Map();
  dailyBuckets.forEach((d) => {
    const key = keyFn(d.date);
    if (!map.has(key)) map.set(key, { key, date: d.date, total: 0, count: 0, otherCurrencies: {} });
    const b = map.get(key);
    b.total += d.total;
    b.count += d.count;
    Object.entries(d.otherCurrencies).forEach(([code, o]) => {
      if (!b.otherCurrencies[code]) b.otherCurrencies[code] = { total: 0, count: 0 };
      b.otherCurrencies[code].total += o.total;
      b.otherCurrencies[code].count += o.count;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.date - a.date);
};

// One row of the ledger list. Memoised so it only re-renders when its own data changes.
const EntryRow = memo(function EntryRow({ e, dayKey, showDay, defaultCurrency, dayRefs, onNullify }) {
  const cur = e.currency || defaultCurrency;
  return (
    <div>
      {showDay && (
        <div
          ref={(el) => {
            dayRefs.current[dayKey] = el;
          }}
          className="px-4 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold"
          style={{ background: 'rgba(245,243,238,0.05)', color: '#7C8883' }}
        >
          {dayLabelOf(new Date(e.id))}
        </div>
      )}
      <div
        onDoubleClick={() => onNullify(e.id)}
        className="px-4 py-3 flex items-center text-sm select-none"
        style={{
          borderBottom: '1px dashed rgba(245,243,238,0.08)',
          opacity: e.nullified ? 0.5 : 1,
          touchAction: 'manipulation',
        }}
      >
        <span className="flex-1 font-medium" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          <span className="inline-flex items-center">
            {e.name}
            {e.nullified && (
              <span className="ml-1.5 text-[9px] px-1.5 rounded-full uppercase" style={{ background: 'rgba(245,243,238,0.08)', color: '#7C8883' }}>
                Void
              </span>
            )}
            {cur !== defaultCurrency && (
              <span className="ml-1.5 text-[9px] px-1.5 rounded-full uppercase" style={{ background: 'rgba(1,169,157,0.12)', color: '#01A99D' }}>
                {e.currency}
              </span>
            )}
          </span>
          {e.quantity >= 2 && (
            <span className="block text-[11px] mono-num" style={{ color: '#7C8883' }}>
              {currencyOf(cur).symbol}
              {fmt(e.price / e.quantity)}/unit
            </span>
          )}
        </span>
        <span className="w-16 text-center mono-num" style={{ color: '#7C8883' }}>
          ×{e.quantity}
        </span>
        <span className="w-24 text-right mono-num font-semibold" style={{ color: e.nullified ? '#7C8883' : '#01A99D' }}>
          {currencyOf(cur).symbol}
          {fmt(e.price)}
        </span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Demo mode: in-memory storage + generated mock data
// ---------------------------------------------------------------------------
const makeMemoryStorage = (seed) => {
  const store = new Map(Object.entries(seed));
  return {
    get: async (key) => (store.has(key) ? { key, value: store.get(key) } : null),
    set: async (key, value) => {
      store.set(key, value);
      return { key, value };
    },
    delete: async (key) => {
      store.delete(key);
      return { key, deleted: true };
    },
  };
};

// Small seeded RNG so the demo looks the same every time it is opened.
const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Entries run from the current year back two years. Every year has at least 6 months of
// entries and every month with entries has at least 5 different days.
const buildDemoEntries = ({ seed, catalog, fixedMonthly, fixedYearly, specials, days, perDay, skipPerPastYear, yearFactors, voidIndexes }) => {
  const rand = seededRandom(seed);
  const now = new Date();
  const thisYear = now.getFullYear();
  const usedIds = new Set();
  const out = [];

  const roundPrice = (n) => (n >= 10000 ? Math.round(n / 500) * 500 : n >= 1000 ? Math.round(n / 50) * 50 : Math.round(n / 10) * 10);

  const add = (date, name, quantity, price, currency) => {
    if (date.getTime() > now.getTime()) return;
    let id = date.getTime();
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    out.push({ id, name, quantity, price, currency });
  };

  const totalWeight = catalog.reduce((sum, c) => sum + c.weight, 0);
  const pickCatalogItem = () => {
    let r = rand() * totalWeight;
    for (const c of catalog) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return catalog[0];
  };
  const priceFor = (unit, qty, yi) => roundPrice(unit * qty * yearFactors[yi] * (0.92 + rand() * 0.16));

  for (let offset = 2; offset >= 0; offset--) {
    const year = thisYear - offset;
    const yi = 2 - offset;
    const lastMonth = year === thisYear ? now.getMonth() : 11;

    let months = [];
    for (let m = 0; m <= lastMonth; m++) months.push(m);
    if (year !== thisYear) {
      for (let k = 0; k < skipPerPastYear && months.length > 7; k++) {
        months.splice(Math.floor(rand() * months.length), 1);
      }
    }

    months.forEach((month) => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const availableDays = year === thisYear && month === now.getMonth() ? now.getDate() : daysInMonth;
      if (availableDays < 5) return;

      const pool = Array.from({ length: availableDays }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const count = Math.min(availableDays, days[0] + Math.floor(rand() * (days[1] - days[0] + 1)));
      pool.slice(0, count).forEach((day) => {
        const n = perDay[0] + Math.floor(rand() * (perDay[1] - perDay[0] + 1));
        for (let k = 0; k < n; k++) {
          const item = pickCatalogItem();
          const qty = item.qty[Math.floor(rand() * item.qty.length)];
          const date = new Date(year, month, day, 7 + Math.floor(rand() * 13), Math.floor(rand() * 60));
          add(date, item.name, qty, priceFor(item.unit, qty, yi), 'NGN');
        }
      });

      fixedMonthly.forEach((f) => {
        const day = Math.min(availableDays, f.day[0] + Math.floor(rand() * (f.day[1] - f.day[0] + 1)));
        add(new Date(year, month, day, 9, 15), f.name, f.qty, priceFor(f.unit, f.qty, yi), 'NGN');
      });
    });

    fixedYearly.forEach((f) => {
      add(new Date(year, f.month, f.day, 10, 5), f.name, f.qty, roundPrice(f.unit * f.qty * f.factors[yi]), 'NGN');
    });

    specials
      .filter((sp) => sp.yearsAgo === offset)
      .forEach((sp) => add(new Date(year, sp.month, sp.day, 11, 30), sp.name, sp.qty, sp.price, sp.currency));
  }

  out.sort((a, b) => b.id - a.id);
  voidIndexes.forEach((i) => {
    if (out[i]) out[i].nullified = true;
  });
  return out;
};

const buildDemoSeed = () => {
  const shopEntries = buildDemoEntries({
    seed: 2024,
    yearFactors: [1, 1.28, 1.55],
    days: [8, 15],
    perDay: [1, 3],
    skipPerPastYear: 2,
    voidIndexes: [5, 19, 41, 133, 290],
    catalog: [
      { name: 'Rice', unit: 62000, qty: [1, 2, 3, 4], weight: 4 },
      { name: 'Beans', unit: 38000, qty: [1, 2], weight: 3 },
      { name: 'Garri', unit: 24000, qty: [1, 2, 3], weight: 4 },
      { name: 'Palm oil', unit: 9500, qty: [2, 4, 6], weight: 3 },
      { name: 'Vegetable oil', unit: 11000, qty: [2, 3, 4], weight: 3 },
      { name: 'Tomatoes', unit: 18000, qty: [1, 2, 3], weight: 4 },
      { name: 'Pepper', unit: 14000, qty: [1, 2], weight: 3 },
      { name: 'Onions', unit: 28000, qty: [1, 2], weight: 2 },
      { name: 'Eggs', unit: 3400, qty: [5, 10, 15, 20], weight: 4 },
      { name: 'Indomie', unit: 7800, qty: [2, 3, 5], weight: 4 },
      { name: 'Sugar', unit: 1300, qty: [12, 24], weight: 2 },
      { name: 'Bread', unit: 1000, qty: [10, 15, 20], weight: 3 },
      { name: 'Maggi', unit: 2200, qty: [2, 4, 6], weight: 3 },
      { name: 'Salt', unit: 350, qty: [20, 30, 50], weight: 1 },
      { name: 'Peak milk', unit: 1100, qty: [12, 24], weight: 2 },
      { name: 'Detergent', unit: 2400, qty: [6, 12], weight: 2 },
      { name: 'Bottled water', unit: 1800, qty: [5, 10, 20], weight: 2 },
      { name: 'Soft drinks', unit: 5500, qty: [2, 3, 5], weight: 2 },
      { name: 'Transport', unit: 3500, qty: [1, 1, 2], weight: 4 },
      { name: 'Generator fuel', unit: 650, qty: [10, 15, 20, 25], weight: 3 },
    ],
    fixedMonthly: [{ name: 'Electricity', unit: 18000, qty: 1, day: [4, 9] }],
    fixedYearly: [{ name: 'Shop rent', month: 0, day: 3, unit: 480000, qty: 1, factors: [1, 1.15, 1.3] }],
    specials: [
      { yearsAgo: 2, month: 8, day: 12, name: 'Receipt rolls', qty: 5, price: 18, currency: 'USD' },
      { yearsAgo: 2, month: 10, day: 3, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 1, month: 3, day: 9, name: 'Barcode scanner', qty: 1, price: 45, currency: 'USD' },
      { yearsAgo: 1, month: 5, day: 21, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 1, month: 7, day: 14, name: 'Detergent (Accra)', qty: 20, price: 1150, currency: 'GHS' },
      { yearsAgo: 1, month: 7, day: 15, name: 'Provisions (Accra)', qty: 1, price: 2400, currency: 'GHS' },
      { yearsAgo: 0, month: 1, day: 6, name: 'Receipt rolls', qty: 5, price: 18, currency: 'USD' },
      { yearsAgo: 0, month: 2, day: 17, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 0, month: 4, day: 5, name: 'Detergent (Accra)', qty: 15, price: 980, currency: 'GHS' },
    ],
  });

  const homeEntries = buildDemoEntries({
    seed: 77,
    yearFactors: [1, 1.26, 1.5],
    days: [6, 11],
    perDay: [1, 2],
    skipPerPastYear: 2,
    voidIndexes: [7, 52],
    catalog: [
      { name: 'Supermarket', unit: 14000, qty: [1], weight: 5 },
      { name: 'Cooking gas', unit: 1100, qty: [3, 6, 12], weight: 1 },
      { name: 'Uber', unit: 4200, qty: [1, 2], weight: 4 },
      { name: 'Pharmacy', unit: 5500, qty: [1], weight: 2 },
      { name: 'Fuel', unit: 650, qty: [15, 20, 30], weight: 3 },
      { name: 'Eating out', unit: 7500, qty: [1, 2], weight: 4 },
      { name: 'Haircut', unit: 3000, qty: [1], weight: 1 },
      { name: 'Laundry', unit: 4500, qty: [1], weight: 2 },
      { name: 'Dispenser water', unit: 1500, qty: [1, 2], weight: 2 },
    ],
    fixedMonthly: [
      { name: 'Electricity token', unit: 12000, qty: 1, day: [5, 12] },
      { name: 'Data bundle', unit: 3500, qty: 1, day: [1, 4] },
    ],
    fixedYearly: [{ name: 'House rent', month: 1, day: 4, unit: 850000, qty: 1, factors: [1, 1.12, 1.25] }],
    specials: [
      { yearsAgo: 2, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 14, currency: 'USD' },
      { yearsAgo: 1, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 14, currency: 'USD' },
      { yearsAgo: 1, month: 10, day: 24, name: 'Amazon order', qty: 2, price: 38, currency: 'USD' },
      { yearsAgo: 0, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 15, currency: 'USD' },
      { yearsAgo: 0, month: 5, day: 8, name: 'Online course', qty: 1, price: 29, currency: 'USD' },
    ],
  });

  const itemsOf = (entries) => Array.from(new Set(entries.map((e) => e.name)));

  return {
    'ledgerlog-seen-walkthrough': 'true',
    'ledgerlog-loggers': JSON.stringify([
      { id: 'demo-shop', name: 'Provision Store' },
      { id: 'demo-home', name: 'Home & Personal' },
    ]),
    'ledgerlog-active-logger': 'demo-shop',
    'ledgerlog-items-demo-shop': JSON.stringify(itemsOf(shopEntries)),
    'ledgerlog-entries-demo-shop': JSON.stringify(shopEntries),
    'ledgerlog-currency-demo-shop': 'NGN',
    'ledgerlog-items-demo-home': JSON.stringify(itemsOf(homeEntries)),
    'ledgerlog-entries-demo-home': JSON.stringify(homeEntries),
    'ledgerlog-currency-demo-home': 'NGN',
  };
};

function PerfEdge() {
  return (
    <div
      className="h-3 w-full shrink-0"
      style={{
        backgroundImage:
          'radial-gradient(circle at 6px 0px, transparent 6px, #0F1210 6.5px)',
        backgroundSize: '12px 12px',
        backgroundPosition: 'top',
      }}
    />
  );
}

function ConfirmCircle({ show, onClick, label, onDecrement, onIncrement, raised }) {
  const hasSteppers = onDecrement || onIncrement;
  return (
    <div
      className={`transition-all duration-300 ease-out ${hasSteppers ? 'flex items-center gap-4' : ''}`}
      style={{
        position: 'fixed', // stays in view even when the page behind it is long
        bottom: raised ? 60 : '2rem', // raised in the demo so it clears the Exit Demo pill
        zIndex: 30,
        left: '50%',
        right: 'auto',
        margin: 0,
        width: 'max-content',
        opacity: show ? 1 : 0,
        transform: `translate(-50%, ${show ? '0' : '16px'}) scale(${show ? 1 : 0.85})`,
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      {onDecrement && (
        <button
          onClick={onDecrement}
          aria-label="Decrease by 1"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.15)' }}
        >
          <Minus size={18} color="#F5F3EE" strokeWidth={3} />
        </button>
      )}
      <button
        onClick={onClick}
        aria-label={label || 'Confirm'}
        className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
        style={{ background: '#01A99D', boxShadow: '0 8px 30px rgba(1,169,157,0.45)' }}
      >
        <Check size={34} color="#0F1210" strokeWidth={3} />
      </button>
      {onIncrement && (
        <button
          onClick={onIncrement}
          aria-label="Increase by 1"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.15)' }}
        >
          <Plus size={18} color="#F5F3EE" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

function TopBar({ title, step, stepLabel, onBack, right, left }) {
  return (
    <div className="flex items-center justify-between pt-5 pb-3">
      {left ? (
        left
      ) : (
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: onBack ? 'rgba(245,243,238,0.06)' : 'transparent', visibility: onBack ? 'visible' : 'hidden' }}
        >
          <ChevronLeft size={18} color="#F5F3EE" style={{ transform: 'translateX(-1px)' }} />
        </button>
      )}
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {stepLabel || `Step ${step} of 3`}
        </span>
        <span className="text-sm font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </span>
      </div>
      {right ? right : <div className="w-8" />}
    </div>
  );
}

function MonthYearPicker({ open, availableMonths, onCancel, onSelect }) {
  const years = Array.from(new Set(Array.from(availableMonths).map((k) => k.split('-')[0]))).sort((a, b) => b - a);
  const [year, setYear] = useState(years[0] || new Date().getFullYear().toString());

  useEffect(() => {
    if (open && years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [open]);

  if (!open) return null;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearIndex = years.indexOf(year);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => yearIndex < years.length - 1 && setYear(years[yearIndex + 1])}
            disabled={yearIndex >= years.length - 1}
            className="w-7 h-7 flex items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'rgba(245,243,238,0.06)' }}
          >
            <ChevronLeft size={14} color="#F5F3EE" />
          </button>
          <span className="text-sm font-semibold mono-num" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
            {year}
          </span>
          <button
            onClick={() => yearIndex > 0 && setYear(years[yearIndex - 1])}
            disabled={yearIndex <= 0}
            className="w-7 h-7 flex items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'rgba(245,243,238,0.06)' }}
          >
            <ChevronRight size={14} color="#F5F3EE" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {monthNames.map((name, i) => {
            const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`;
            const enabled = availableMonths.has(monthKey);
            return (
              <button
                key={name}
                disabled={!enabled}
                onClick={() => onSelect(monthKey)}
                className="py-2 rounded-xl text-xs font-medium disabled:opacity-25"
                style={{
                  fontFamily: 'Manrope',
                  background: enabled ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                  color: enabled ? '#01A99D' : '#7C8883',
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LoggerSwitcher({ open, loggers, activeLoggerId, onSelect, onCreate, newName, setNewName, onCancel }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          Switch ledger
        </p>
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto mb-4">
          {loggers.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
              style={{
                background: l.id === activeLoggerId ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                border: `1px solid ${l.id === activeLoggerId ? '#01A99D' : 'rgba(245,243,238,0.1)'}`,
              }}
            >
              <span className="text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                {l.name}
              </span>
              {l.id === activeLoggerId && <Check size={14} color="#01A99D" />}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            placeholder="New ledger name"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE' }}
          />
          <button onClick={onCreate} aria-label="Create ledger" className="px-3.5 rounded-xl flex items-center justify-center" style={{ background: '#01A99D' }}>
            <Plus size={16} color="#0F1210" strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </p>
        <p className="text-xs mb-5" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrencyPicker({ open, value, onCancel, onSelect, title = 'Currency for this entry' }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </p>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => onSelect(c.code)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
              style={{
                background: value === c.code ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                border: `1px solid ${value === c.code ? '#01A99D' : 'rgba(245,243,238,0.1)'}`,
              }}
            >
              <span className="text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                {c.name}
              </span>
              <span className="mono-num text-xs" style={{ color: value === c.code ? '#01A99D' : '#7C8883' }}>
                {c.code} · {c.symbol}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const WALKTHROUGH_SLIDES = [
  {
    title: 'One app, many ledgers',
    body: "Each ledger keeps its own entries - switch between ledgers any time. Multiple currencies are available.",
  },
  {
    title: 'Fast entry, few taps',
    body: 'Built for quick, one-handed use. Pick or add an item, then use the on-screen keypad to enter quantity and price.',
  },
  {
    title: 'Your ledger, your totals',
    body: 'Every entry lands in your ledger. Made for quick bookkeeping and tracking expenses - not to be used as a replacement for accounting.',
  },
];

function Walkthrough({ open, step, setStep, onDismiss }) {
  if (!open) return null;
  const slide = WALKTHROUGH_SLIDES[step];
  const isLast = step === WALKTHROUGH_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: '#0F1210' }}>
      <div className="w-full max-w-xs flex flex-col items-center text-center">
        <span className="mono-num" style={{ fontSize: '2.5rem', lineHeight: 1, color: '#01A99D' }}>
          {step + 1}/{WALKTHROUGH_SLIDES.length}
        </span>
        <p className="text-lg font-bold mt-4 mb-2" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {slide.title}
        </p>
        <p className="text-sm leading-relaxed mb-8" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {slide.body}
        </p>

        <div className="flex items-center gap-1.5 mb-8">
          {WALKTHROUGH_SLIDES.map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: '6px',
                height: '6px',
                background: i === step ? '#01A99D' : 'rgba(245,243,238,0.15)',
                transition: 'background 200ms ease',
              }}
            />
          ))}
        </div>

        <div className="w-full flex gap-2.5">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-3 rounded-2xl text-sm font-medium"
              style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? onDismiss() : setStep((s) => s + 1))}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
          >
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>

        <button
          onClick={onDismiss}
          disabled={isLast}
          aria-hidden={isLast}
          tabIndex={isLast ? -1 : 0}
          className="mt-4 text-xs"
          style={{ color: '#7C8883', fontFamily: 'Manrope', visibility: isLast ? 'hidden' : 'visible' }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({
  onClose,
  loggers,
  editingLoggerId,
  loggerNameDraft,
  setLoggerNameDraft,
  onStartRename,
  onSaveRename,
  onRequestDeleteLedger,
  onReplayWalkthrough,
  onOpenExport,
  onOpenImport,
  onRequestDeleteAccount,
  onOpenFeedback,
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-center" style={{ background: '#0A0C0B' }}>
      <div className="w-full max-w-sm flex flex-col" style={{ background: '#0F1210', minHeight: '100dvh' }}>
        <PerfEdge />
        <div className="px-5">
          <TopBar
            title="Settings"
            stepLabel="Account"
            left={
              <button onClick={onOpenFeedback} aria-label="Send feedback" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(245,243,238,0.06)' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>🌷</span>
              </button>
            }
            right={
              <button onClick={onClose} aria-label="Close settings" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(245,243,238,0.06)' }}>
                <X size={16} color="#F5F3EE" />
              </button>
            }
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          {/* Ledgers */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2 mt-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Ledgers</p>
          <div className="flex flex-col gap-2 mb-8">
            {loggers.map((l) => (
              <div key={l.id} className="flex items-center gap-2 p-3 rounded-2xl" style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)' }}>
                {editingLoggerId === l.id ? (
                  <>
                    <input
                      value={loggerNameDraft}
                      onChange={(e) => setLoggerNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSaveRename()}
                      autoFocus
                      className="flex-1 bg-transparent outline-none text-sm"
                      style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
                    />
                    <button onClick={onSaveRename} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#01A99D', color: '#0F1210' }}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>{l.name}</span>
                    <button onClick={() => onStartRename(l)} aria-label={`Rename ${l.name}`}>
                      <Pencil size={14} color="#7C8883" />
                    </button>
                    <button onClick={() => onRequestDeleteLedger(l.id)} aria-label={`Delete ${l.name}`}>
                      <Trash2 size={14} color="#7C8883" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Help */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Help</p>
          <p className="text-[11px] mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            Tip: Double-tap to delete items or nullify entries.
          </p>
          <button
            onClick={onReplayWalkthrough}
            className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 mb-8 text-sm font-medium"
            style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
          >
            <RotateCcw size={15} color="#7C8883" /> See the walkthrough again
          </button>

          {/* Data */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Your data</p>
          <p className="text-[11px] mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            Download a backup to restore your data manually if you move to another device.
          </p>
          <div className="flex flex-col gap-2 mb-8">
            <button
              onClick={onOpenExport}
              className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
            >
              <Download size={15} color="#7C8883" /> Download backup file
            </button>
            <button
              onClick={onOpenImport}
              className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
            >
              <Upload size={15} color="#7C8883" /> Restore from backup file
            </button>
          </div>

          {/* Danger zone */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#F87171', fontFamily: 'Manrope' }}>Danger zone</p>
          <button
            onClick={onRequestDeleteAccount}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', fontFamily: 'Manrope' }}
          >
            <AlertTriangle size={15} /> Delete account
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick, onDoubleClick }) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border"
      style={{
        fontFamily: 'Manrope',
        background: active ? '#01A99D' : 'rgba(245,243,238,0.04)',
        borderColor: active ? '#01A99D' : 'rgba(245,243,238,0.1)',
        color: active ? '#0F1210' : '#F5F3EE',
      }}
    >
      {label}
    </button>
  );
}

function LedgerApp({ demo = false, onOpenDemo, onExitDemo }) {
  // In demo mode everything reads from / writes to a throwaway in-memory store, never the real data.
  const demoStorageRef = useRef(null);
  if (demo && !demoStorageRef.current) demoStorageRef.current = makeMemoryStorage(buildDemoSeed());
  const storage = demo ? demoStorageRef.current : window.storage;

  const [demoToast, setDemoToast] = useState(false);
  const demoToastTimer = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState(1);
  const [items, setItems] = useState([]);
  const [entries, setEntries] = useState([]);

  const [loggers, setLoggers] = useState([{ id: 'default', name: 'My Ledger' }]);
  const [activeLoggerId, setActiveLoggerId] = useState('default');
  const [showLoggerSwitcher, setShowLoggerSwitcher] = useState(false);
  const [newLoggerName, setNewLoggerName] = useState('');

  const [defaultCurrency, setDefaultCurrency] = useState('NGN');
  const [entryCurrency, setEntryCurrency] = useState('NGN');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const [query1, setQuery1] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemPendingDelete, setItemPendingDelete] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [nullifyEntryId, setNullifyEntryId] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [totalsView, setTotalsView] = useState('daily'); // 'daily' | 'summary'
  const [searchOpen, setSearchOpen] = useState(false);
  // Long lists render in chunks (more rows load as you scroll) so big ledgers stay snappy.
  const [rowLimit, setRowLimit] = useState(60);
  const totalsScrollRef = useRef(null);
  const [dailyLimit, setDailyLimit] = useState(45);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [scrollToMonth, setScrollToMonth] = useState(null);
  const monthRefs = useRef({});

  const [price, setPrice] = useState('');

  const [quantity, setQuantity] = useState('1');
  const [qtyIsDefault, setQtyIsDefault] = useState(true);

  const [lastEntryId, setLastEntryId] = useState(null);
  const [scrollToDay, setScrollToDay] = useState(null);
  const cursorRef = useRef(null);
  const dayRefs = useRef({});
  const logScrollRef = useRef(null);

  const loadLoggerData = async (id, fallbackCurrency = 'NGN') => {
    const fallback = fallbackCurrency;
    try {
      const res = await storage.get(`ledgerlog-items-${id}`, false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        setItems(Array.isArray(parsed) ? parsed : []);
      } else {
        setItems([]);
      }
    } catch (e) {
      setItems([]);
    }

    try {
      const res2 = await storage.get(`ledgerlog-entries-${id}`, false);
      if (res2 && res2.value) {
        const parsed2 = JSON.parse(res2.value);
        setEntries(Array.isArray(parsed2) ? parsed2 : []);
      } else {
        setEntries([]);
      }
    } catch (e) {
      setEntries([]);
    }

    try {
      const res3 = await storage.get(`ledgerlog-currency-${id}`, false);
      const cur = res3 && res3.value ? res3.value : fallback;
      setDefaultCurrency(cur);
      setEntryCurrency(cur);
    } catch (e) {
      setDefaultCurrency(fallback);
      setEntryCurrency(fallback);
    }
  };

  useEffect(() => {
    (async () => {
      let seenWalkthrough = false;
      try {
        const resW = await storage.get('ledgerlog-seen-walkthrough', false);
        seenWalkthrough = !!(resW && resW.value === 'true');
      } catch (e) {}
      if (!seenWalkthrough) {
        setShowWalkthrough(true);
      }

      let loggersList = [{ id: 'default', name: 'My Ledger' }];
      let activeId = 'default';

      try {
        const res = await storage.get('ledgerlog-loggers', false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed) && parsed.length) loggersList = parsed;
        }
      } catch (e) {}

      try {
        const res2 = await storage.get('ledgerlog-active-logger', false);
        activeId = res2 && res2.value && loggersList.some((l) => l.id === res2.value) ? res2.value : loggersList[0].id;
      } catch (e) {
        activeId = loggersList[0].id;
      }

      setLoggers(loggersList);
      setActiveLoggerId(activeId);
      await loadLoggerData(activeId);
      setLoaded(true);
    })();
  }, []);

  const [isSwitchingLogger, setIsSwitchingLogger] = useState(false);

  // ---- App-level settings, walkthrough, data portability ----
  const [showSettings, setShowSettings] = useState(false);

  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);

  const [ledgerPendingDelete, setLedgerPendingDelete] = useState(null);
  const [editingLoggerId, setEditingLoggerId] = useState(null);
  const [loggerNameDraft, setLoggerNameDraft] = useState('');

  const [showImport, setShowImport] = useState(false);
  const importFileRef = useRef(null);
  const [importError, setImportError] = useState('');

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    storage.set('ledgerlog-loggers', JSON.stringify(loggers), false).catch(() => {});
  }, [loggers, loaded]);

  useEffect(() => {
    if (!loaded) return;
    storage.set('ledgerlog-active-logger', activeLoggerId, false).catch(() => {});
  }, [activeLoggerId, loaded]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerlog-items-${activeLoggerId}`, JSON.stringify(items), false).catch(() => {});
  }, [items, loaded, activeLoggerId, isSwitchingLogger]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerlog-entries-${activeLoggerId}`, JSON.stringify(entries), false).catch(() => {});
  }, [entries, loaded, activeLoggerId, isSwitchingLogger]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerlog-currency-${activeLoggerId}`, defaultCurrency, false).catch(() => {});
  }, [defaultCurrency, loaded, activeLoggerId, isSwitchingLogger]);

  const switchLogger = async (id, fallbackCurrency = 'NGN') => {
    if (id === activeLoggerId) {
      setShowLoggerSwitcher(false);
      return;
    }
    setIsSwitchingLogger(true); // suppress the save effects below until the new logger's data has fully landed
    setActiveLoggerId(id);
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    await loadLoggerData(id, fallbackCurrency);
    setIsSwitchingLogger(false);
    setShowLoggerSwitcher(false);
  };

  const createLogger = async () => {
    const name = newLoggerName.trim();
    if (!name) return;
    const id = 'logger-' + Date.now();
    const seedCurrency = defaultCurrency; // new ledgers start with the currently-active ledger's currency
    setLoggers((prev) => [...prev, { id, name }]);
    setNewLoggerName('');
    await switchLogger(id, seedCurrency);
  };

  // ---- Walkthrough ----
  const dismissWalkthrough = () => {
    setShowWalkthrough(false);
    setWalkthroughStep(0);
    storage.set('ledgerlog-seen-walkthrough', 'true', false).catch(() => {});
  };

  const replayWalkthrough = () => {
    setShowSettings(false);
    setWalkthroughStep(0);
    setShowWalkthrough(true);
  };

  // ---- Ledger rename / delete ----
  const startRenameLedger = (l) => {
    setEditingLoggerId(l.id);
    setLoggerNameDraft(l.name);
  };

  const saveRenameLedger = () => {
    const name = loggerNameDraft.trim();
    if (!name || !editingLoggerId) {
      setEditingLoggerId(null);
      return;
    }
    setLoggers((prev) => prev.map((l) => (l.id === editingLoggerId ? { ...l, name } : l)));
    setEditingLoggerId(null);
  };

  const deleteLedgerKeys = async (id) => {
    try {
      await storage.delete(`ledgerlog-items-${id}`, false);
    } catch (e) {}
    try {
      await storage.delete(`ledgerlog-entries-${id}`, false);
    } catch (e) {}
    try {
      await storage.delete(`ledgerlog-currency-${id}`, false);
    } catch (e) {}
  };

  const confirmDeleteLedger = async () => {
    const id = ledgerPendingDelete;
    if (!id) return;
    setLedgerPendingDelete(null);

    const remaining = loggers.filter((l) => l.id !== id);
    const finalRemaining = remaining.length ? remaining : [{ id: 'logger-' + Date.now(), name: 'My Ledger' }];

    setLoggers(finalRemaining);
    await deleteLedgerKeys(id);

    if (id === activeLoggerId) {
      await switchLogger(finalRemaining[0].id);
    }
  };

  // ---- Delete account (wipes everything) ----
  const confirmDeleteAccount = async () => {
    for (const l of loggers) {
      await deleteLedgerKeys(l.id);
    }
    const keysToClear = [
      'ledgerlog-loggers',
      'ledgerlog-active-logger',
      'ledgerlog-seen-walkthrough',
    ];
    for (const key of keysToClear) {
      try {
        await storage.delete(key, false);
      } catch (e) {}
    }

    const freshId = 'default';
    setLoggers([{ id: freshId, name: 'My Ledger' }]);
    setActiveLoggerId(freshId);
    setItems([]);
    setEntries([]);
    setDefaultCurrency('NGN');
    setEntryCurrency('NGN');
    setShowDeleteAccount(false);
    setShowSettings(false);
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setWalkthroughStep(0);
    setShowWalkthrough(true);
  };

  // ---- Export / import all data (manual backup, given Google-only sign-in has no linked-email recovery path) ----
  const buildExportPayload = async () => {
    const perLogger = {};
    for (const l of loggers) {
      let loggerItems = [];
      let loggerEntries = [];
      let loggerCurrency = 'NGN';
      try {
        const r = await storage.get(`ledgerlog-items-${l.id}`, false);
        if (r && r.value) loggerItems = JSON.parse(r.value);
      } catch (e) {}
      try {
        const r2 = await storage.get(`ledgerlog-entries-${l.id}`, false);
        if (r2 && r2.value) loggerEntries = JSON.parse(r2.value);
      } catch (e) {}
      try {
        const r3 = await storage.get(`ledgerlog-currency-${l.id}`, false);
        if (r3 && r3.value) loggerCurrency = r3.value;
      } catch (e) {}
      perLogger[l.id] = { items: loggerItems, entries: loggerEntries, currency: loggerCurrency };
    }
    return {
      exportedAt: new Date().toISOString(),
      loggers,
      perLogger,
    };
  };

  const openExport = async () => {
    const payload = await buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      setImportError('Couldn\u2019t read that file.');
      return;
    }
    await importData(text);
  };

  const importData = async (text) => {
    setImportError('');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setImportError('That doesn\u2019t look like valid backup data.');
      return;
    }
    if (!parsed || !Array.isArray(parsed.loggers) || !parsed.perLogger) {
      setImportError('That doesn\u2019t look like valid backup data.');
      return;
    }

    for (const l of parsed.loggers) {
      const data = parsed.perLogger[l.id] || { items: [], entries: [], currency: 'NGN' };
      try {
        await storage.set(`ledgerlog-items-${l.id}`, JSON.stringify(data.items || []), false);
        await storage.set(`ledgerlog-entries-${l.id}`, JSON.stringify(data.entries || []), false);
        await storage.set(`ledgerlog-currency-${l.id}`, data.currency || 'NGN', false);
      } catch (e) {}
    }

    setLoggers(parsed.loggers);

    setShowImport(false);
    setShowSettings(false);

    const targetId = parsed.loggers[0].id;
    const targetCurrency = (parsed.perLogger[targetId] && parsed.perLogger[targetId].currency) || 'NGN';
    setIsSwitchingLogger(true);
    setActiveLoggerId(targetId);
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    await loadLoggerData(targetId, targetCurrency);
    setIsSwitchingLogger(false);
  };

  const resetFlow = () => {
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setEntryCurrency(defaultCurrency);
  };

  const confirmCancelEntry = () => {
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setEntryCurrency(defaultCurrency);
    setShowCancelConfirm(false);
    setScreen(4);
  };

  // ---- Screen 1: item select ----
  const filteredItems = items.filter((i) => i.toLowerCase().includes(query1.trim().toLowerCase()));
  const exactMatch = items.some((i) => i.toLowerCase() === query1.trim().toLowerCase());
  const showAddChip = query1.trim().length > 0 && !exactMatch;

  const chooseItem = (name) => {
    setSelectedItem(name);
  };

  const deleteItem = (name) => {
    setItems((prev) => prev.filter((i) => i !== name));
    setSelectedItem((prev) => (prev === name ? null : prev));
    setItemPendingDelete(null);
  };

  const addNewItem = () => {
    const raw = query1.trim();
    if (!raw) return;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    setItems((prev) => [name, ...prev]);
    setSelectedItem(name);
    setQuery1('');
  };

  const showDemoNotice = () => {
    setSelectedItem(null);
    setQuery1('');
    setScreen(4);
    setDemoToast(true);
    clearTimeout(demoToastTimer.current);
    demoToastTimer.current = setTimeout(() => setDemoToast(false), 3500);
  };

  useEffect(() => () => clearTimeout(demoToastTimer.current), []);

  const confirmScreen1 = () => {
    if (!selectedItem) return;
    if (demo) {
      showDemoNotice();
      return;
    }
    setScreen(2);
  };

  // ---- Screen 2: quantity keypad ----
  const pressQtyKey = (k) => {
    if (k === 'back') {
      setQuantity((q) => q.slice(0, -1));
      setQtyIsDefault(false);
      return;
    }
    if (k === '.') {
      setQuantity((q) => {
        if (qtyIsDefault) return '0.';
        return q.includes('.') ? q : q === '' ? '0.' : q + '.';
      });
      setQtyIsDefault(false);
      return;
    }
    setQuantity((q) => {
      if (qtyIsDefault) return k; // replace the prefilled default of 1 on the very first press only
      if (q.length > 11) return q;
      return q + k;
    });
    setQtyIsDefault(false);
  };

  const qtyValid = quantity !== '' && parseFloat(quantity) > 0;

  const adjustQuantity = (delta) => {
    setQuantity((q) => {
      const current = parseFloat(q) || 0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return String(next);
    });
    setQtyIsDefault(false);
  };

  const confirmScreenQty = () => {
    if (!qtyValid) return;
    setScreen(3);
  };

  // ---- Screen 3: price keypad (submits the entry) ----
  const pressKey = (k) => {
    if (k === 'back') {
      setPrice((p) => p.slice(0, -1));
      return;
    }
    if (k === '.') {
      setPrice((p) => (p.includes('.') ? p : (p === '' ? '0.' : p + '.')));
      return;
    }
    setPrice((p) => {
      if (p.length > 11) return p;
      if (p === '0') return k;
      return p + k;
    });
  };

  const priceValid = price !== '' && price !== '.' && parseFloat(price) > 0;

  const confirmScreenPrice = () => {
    if (!priceValid) return;
    const entry = {
      id: Date.now(),
      name: selectedItem,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      currency: entryCurrency,
    };
    setEntries((prev) => [entry, ...prev]);
    setLastEntryId(entry.id);
    setEntryCurrency(defaultCurrency);
    setScreen(4);
  };

  const sendFeedback = () => {
    const text = feedbackText.trim();
    if (!text) return;
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('LedgerLog feedback')}&body=${encodeURIComponent(text)}`;
    window.location.href = url;
    setShowFeedback(false);
    setFeedbackText('');
  };

  const searchTerm = searchQuery.trim().toLowerCase();
  const isSearching = searchOpen && searchTerm !== '';
  const visibleEntries = useMemo(
    () => (isSearching ? entries.filter((e) => e.name.toLowerCase().includes(searchTerm)) : entries),
    [entries, isSearching, searchTerm]
  );

  // Rows for the ledger list, with each row's day key and whether it starts a new day.
  const entryRows = useMemo(
    () =>
      visibleEntries.map((e, i) => {
        const dayKey = new Date(e.id).toDateString();
        const prevDayKey = i > 0 ? new Date(visibleEntries[i - 1].id).toDateString() : null;
        return { e, dayKey, showDay: dayKey !== prevDayKey };
      }),
    [visibleEntries]
  );

  // Sum of matching (non-nullified) entries, per currency, default currency first.
  const searchSums = useMemo(() => {
    const sums = {};
    visibleEntries.forEach((e) => {
      if (e.nullified) return;
      const cur = e.currency || defaultCurrency;
      sums[cur] = (sums[cur] || 0) + (parseFloat(e.price) || 0);
    });
    return Object.entries(sums).sort(([a], [b]) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : 0));
  }, [visibleEntries, defaultCurrency]);

  useEffect(() => {
    setRowLimit(60);
  }, [searchTerm]);

  const loadMoreOnScroll = (ev, total, setLimit, step) => {
    const t = ev.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 400) setLimit((l) => (l < total ? l + step : l));
  };

  const toggleSearch = () => {
    setSearchOpen((o) => !o);
    setSearchQuery('');
  };

  const nullifyTarget = entries.find((e) => e.id === nullifyEntryId) || null;

  const toggleNullifyEntry = () => {
    setEntries((prev) => prev.map((e) => (e.id === nullifyEntryId ? { ...e, nullified: !e.nullified } : e)));
    setNullifyEntryId(null);
  };

  const dailyTotals = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (e.nullified) return; // nullified entries don't count toward any totals
      const d = new Date(e.id);
      const key = d.toDateString();
      const cur = e.currency || defaultCurrency;
      const amount = parseFloat(e.price) || 0;
      if (!map.has(key)) {
        map.set(key, { key, date: d, total: 0, count: 0, otherCurrencies: {} });
      }
      const bucket = map.get(key);
      bucket.count += 1; // every purchase that day, regardless of currency
      if (cur === defaultCurrency) {
        bucket.total += amount;
      } else {
        if (!bucket.otherCurrencies[cur]) bucket.otherCurrencies[cur] = { total: 0, count: 0 };
        bucket.otherCurrencies[cur].total += amount;
        bucket.otherCurrencies[cur].count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.date - a.date);
  }, [entries, defaultCurrency]);

  const availableMonths = useMemo(() => new Set(dailyTotals.map((d) => monthKeyOf(d.date))), [dailyTotals]);
  const monthlyTotals = useMemo(() => rollupOf(dailyTotals, (d) => monthKeyOf(d)), [dailyTotals]);
  const yearlyTotals = useMemo(() => rollupOf(dailyTotals, (d) => String(d.getFullYear())), [dailyTotals]);

  const backToTop = () => {
    const listRef = screen === 4 ? logScrollRef : totalsScrollRef;
    const list = listRef.current;
    if (list && list.scrollTo) list.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    const dialog = list && list.closest ? list.closest('[role="dialog"]') : null;
    if (dialog && dialog.scrollTo) dialog.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (screen !== 4 || !scrollToDay) return;
    const idx = entryRows.findIndex((r) => r.dayKey === scrollToDay);
    if (idx >= rowLimit) {
      setRowLimit(idx + 40); // make sure the target row exists before scrolling to it
      return;
    }
    if (dayRefs.current[scrollToDay]) {
      dayRefs.current[scrollToDay].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToDay(null);
    }
  }, [screen, scrollToDay, entries, rowLimit, entryRows]);

  useEffect(() => {
    if (screen !== 5 || !scrollToMonth) return;
    if (totalsView === 'daily') {
      const idx = dailyTotals.findIndex((d) => monthKeyOf(d.date) === scrollToMonth);
      if (idx >= dailyLimit) {
        setDailyLimit(idx + 30);
        return;
      }
    }
    if (monthRefs.current[scrollToMonth]) {
      monthRefs.current[scrollToMonth].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToMonth(null);
    }
  }, [screen, scrollToMonth, entries, totalsView, dailyLimit, dailyTotals]);

  const dayLabel = dayLabelOf;

  return (
    <div
      className="w-full flex justify-center"
      style={{ background: '#0A0C0B', minHeight: '100dvh', fontFamily: 'Manrope' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        .mono-num { font-family: 'Space Mono', monospace; }
        .item-search::placeholder, .feedback-input::placeholder { color: #7C8883; opacity: 1; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <div
        className="w-full max-w-sm flex flex-col"
        // Ledger and Totals screens are locked to the viewport so their lists scroll inside the dashed box.
        style={{ background: '#0F1210', minHeight: '100dvh', height: screen >= 4 ? '100dvh' : undefined, position: 'relative' }}
      >
        <PerfEdge />

        {/* SCREEN 1 */}
        {screen === 1 && (
          <div className="flex-1 flex flex-col px-5 pb-32">
            <TopBar
              title="What did you buy?"
              step={1}
              left={
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Settings size={16} color="#F5F3EE" />
                </button>
              }
              right={
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  aria-label="Cancel entry"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Ban size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex items-center gap-2" style={{ marginTop: 16, marginBottom: 16 }}>
              <button
                onClick={() => setShowLoggerSwitcher(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ fontFamily: 'Manrope', background: 'rgba(245,243,238,0.05)', color: '#F5F3EE', border: '1px solid rgba(245,243,238,0.1)' }}
              >
                <ArrowLeftRight size={12} color="#F5F3EE" />
                {loggers.find((l) => l.id === activeLoggerId)?.name || 'My Ledger'}
              </button>
            </div>

            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: 'rgba(245,243,238,0.05)', border: '1px solid rgba(245,243,238,0.08)', marginBottom: 16 }}
            >
              <Search size={16} color="#F5F3EE" />
              <input
                value={query1}
                onChange={(e) => setQuery1(e.target.value)}
                placeholder="Search or add an item"
                className="item-search flex-1 bg-transparent outline-none text-sm"
                style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              {showAddChip && (
                <button
                  onClick={addNewItem}
                  className="px-4 py-2.5 rounded-full text-sm font-medium flex items-center gap-1.5 border"
                  style={{ borderColor: '#01A99D', color: '#01A99D', fontFamily: 'Manrope' }}
                >
                  <Plus size={14} /> Add "{query1.trim()}"
                </button>
              )}
              {filteredItems.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  active={selectedItem === name}
                  onClick={() => chooseItem(name)}
                  onDoubleClick={() => setItemPendingDelete(name)}
                />
              ))}
              {filteredItems.length === 0 && !showAddChip && (
                <p className="text-sm" style={{ color: '#7C8883' }}>
                  No items yet. Type to add a new item.
                </p>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 2 */}
        {screen === 2 && (
          <div className="flex-1 flex flex-col px-5 pb-28">
            <TopBar
              title="How many?"
              step={2}
              onBack={() => setScreen(1)}
              right={
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  aria-label="Cancel entry"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Ban size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex-1 flex flex-col items-center justify-center mb-6">
              <span className="text-xs uppercase tracking-[0.2em]" style={{ color: '#7C8883' }}>
                Quantity
              </span>
              <div
                className="mono-num mt-2 text-5xl font-bold flex items-baseline gap-1"
                style={{ color: '#01A99D', minHeight: '3.5rem' }}
              >
                <span>{quantity}</span>
                <span className="inline-block w-0.5 h-9 ml-0.5 animate-pulse" style={{ background: '#01A99D' }} />
              </div>
              <div className={`mt-4 h-7 ${entryCurrency !== defaultCurrency ? 'mb-6' : ''}`} aria-hidden="true" />
            </div>

            <div className="grid grid-cols-4 gap-2.5 mb-2">
              <KeyBtn label="7" onPress={() => pressQtyKey('7')} />
              <KeyBtn label="8" onPress={() => pressQtyKey('8')} />
              <KeyBtn label="9" onPress={() => pressQtyKey('9')} />
              <KeyBtn icon onPress={() => pressQtyKey('back')} muted>
                <Delete size={18} />
              </KeyBtn>

              <KeyBtn label="4" onPress={() => pressQtyKey('4')} />
              <KeyBtn label="5" onPress={() => pressQtyKey('5')} />
              <KeyBtn label="6" onPress={() => pressQtyKey('6')} />
              <KeyBtn label="00" onPress={() => pressQtyKey('00')} muted small />

              <KeyBtn label="1" onPress={() => pressQtyKey('1')} />
              <KeyBtn label="2" onPress={() => pressQtyKey('2')} />
              <KeyBtn label="3" onPress={() => pressQtyKey('3')} />
              <KeyBtn label="000" onPress={() => pressQtyKey('000')} muted small />

              <KeyBtn label="." onPress={() => pressQtyKey('.')} />
              <div className="col-span-3">
                <KeyBtn label="0" onPress={() => pressQtyKey('0')} full />
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 3 */}
        {screen === 3 && (
          <div className="flex-1 flex flex-col px-5 pb-28">
            <TopBar
              title={selectedItem}
              step={3}
              onBack={() => setScreen(2)}
              right={
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  aria-label="Cancel entry"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Ban size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex-1 flex flex-col items-center justify-center mb-6">
              <span className="text-xs uppercase tracking-[0.2em]" style={{ color: '#7C8883' }}>
                Total price
              </span>
              <div
                ref={cursorRef}
                className="mono-num mt-2 text-5xl font-bold flex items-baseline gap-1"
                style={{ color: '#01A99D', minHeight: '3.5rem' }}
              >
                <span style={{ fontSize: '2rem', opacity: 0.7 }}>{currencyOf(entryCurrency).symbol}</span>
                <span>{price}</span>
                <span className="inline-block w-0.5 h-9 ml-0.5 animate-pulse" style={{ background: '#01A99D' }} />
              </div>

              <button
                onClick={() => setShowCurrencyPicker(true)}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  fontFamily: 'Manrope',
                  background: entryCurrency !== defaultCurrency ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.05)',
                  color: entryCurrency !== defaultCurrency ? '#01A99D' : '#7C8883',
                  border: `1px solid ${entryCurrency !== defaultCurrency ? 'rgba(1,169,157,0.3)' : 'rgba(245,243,238,0.1)'}`,
                }}
              >
                {entryCurrency} · {currencyOf(entryCurrency).symbol}
                {entryCurrency !== defaultCurrency ? ' - not your default' : ' - change currency'}
              </button>
              {entryCurrency !== defaultCurrency && (
                <button
                  onClick={() => setDefaultCurrency(entryCurrency)}
                  className="mt-2 text-[11px] underline underline-offset-2"
                  style={{ fontFamily: 'Manrope', color: '#7C8883' }}
                >
                  Set {entryCurrency} as this ledger's default
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2.5 mb-2">
              <KeyBtn label="7" onPress={() => pressKey('7')} />
              <KeyBtn label="8" onPress={() => pressKey('8')} />
              <KeyBtn label="9" onPress={() => pressKey('9')} />
              <KeyBtn icon onPress={() => pressKey('back')} muted>
                <Delete size={18} />
              </KeyBtn>

              <KeyBtn label="4" onPress={() => pressKey('4')} />
              <KeyBtn label="5" onPress={() => pressKey('5')} />
              <KeyBtn label="6" onPress={() => pressKey('6')} />
              <KeyBtn label="00" onPress={() => pressKey('00')} muted small />

              <KeyBtn label="1" onPress={() => pressKey('1')} />
              <KeyBtn label="2" onPress={() => pressKey('2')} />
              <KeyBtn label="3" onPress={() => pressKey('3')} />
              <KeyBtn label="000" onPress={() => pressKey('000')} muted small />

              <KeyBtn label="." onPress={() => pressKey('.')} />
              <div className="col-span-3">
                <KeyBtn label="0" onPress={() => pressKey('0')} full />
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 4 */}
        {screen === 4 && (
          <div className="flex-1 min-h-0 flex flex-col px-5 pb-8">
            <TopBar
              title={loggers.find((l) => l.id === activeLoggerId)?.name || 'My Ledger'}
              stepLabel="Ledger"
              left={
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Settings size={16} color="#F5F3EE" />
                </button>
              }
              right={
                <button
                  onClick={toggleSearch}
                  aria-label={searchOpen ? 'Close search' : 'Search entries'}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: searchOpen ? 'rgba(1,169,157,0.18)' : 'rgba(245,243,238,0.06)' }}
                >
                  {searchOpen ? <X size={16} color="#01A99D" /> : <Search size={16} color="#F5F3EE" />}
                </button>
              }
            />

            {searchOpen && (
              <div className="mt-2 mb-3">
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(245,243,238,0.05)', border: '1px solid rgba(245,243,238,0.08)' }}
                >
                  <Search size={16} color="#F5F3EE" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search entries"
                    className="item-search flex-1 bg-transparent outline-none text-sm"
                    style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
                  />
                </div>
                {isSearching && (
                  <p className="text-xs mt-2 px-1 flex flex-wrap gap-x-1.5" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                    <span>
                      {visibleEntries.length} {visibleEntries.length === 1 ? 'match' : 'matches'}
                    </span>
                    {searchSums.map(([code, total]) => (
                      <span key={code} className="mono-num" style={{ color: '#01A99D' }}>
                        · {currencyOf(code).symbol}
                        {fmt(total)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            <div className={`${searchOpen ? '' : 'mt-2 '}mb-5 flex gap-2.5`}>
              <button
                onClick={resetFlow}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
              >
                <Plus size={16} strokeWidth={3} /> Log another
              </button>
              <button
                onClick={() => setScreen(5)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 border"
                style={{ borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <Calendar size={16} strokeWidth={2.5} /> View Totals
              </button>
            </div>

            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'rgba(245,243,238,0.03)', border: '1px dashed rgba(245,243,238,0.15)' }}
            >
              <div className="px-4 py-3 flex text-[11px] uppercase tracking-[0.15em]" style={{ color: '#7C8883', borderBottom: '1px dashed rgba(245,243,238,0.1)' }}>
                <span className="flex-1">Item</span>
                <span className="w-16 text-center">Qty</span>
                <span className="w-24 text-right">Price</span>
              </div>

              {entries.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  Nothing logged yet.
                </p>
              )}

              {entries.length > 0 && visibleEntries.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  No entries match.
                </p>
              )}

              <div
                ref={logScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
                onScroll={(ev) => loadMoreOnScroll(ev, entryRows.length, setRowLimit, 60)}
              >
                {entryRows.slice(0, rowLimit).map((r) => (
                  <EntryRow
                    key={r.e.id}
                    e={r.e}
                    dayKey={r.dayKey}
                    showDay={r.showDay}
                    defaultCurrency={defaultCurrency}
                    dayRefs={dayRefs}
                    onNullify={setNullifyEntryId}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5 */}
        {screen === 5 && (
          <div className="flex-1 min-h-0 flex flex-col px-5 pb-8">
            <TopBar
              title={totalsView === 'daily' ? 'Daily Totals' : 'Monthly & Yearly Totals'}
              stepLabel="Totals"
              onBack={() => setScreen(4)}
              right={
                <button
                  onClick={() => setShowMonthPicker(true)}
                  aria-label="Jump to month"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <CalendarSearch size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="mt-2 mb-5 flex gap-2.5">
              <button
                onClick={() => setTotalsView('daily')}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 ${totalsView === 'daily' ? '' : 'border'}`}
                style={totalsView === 'daily' ? { background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' } : { borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <CalendarDays size={16} strokeWidth={2.5} /> Daily
              </button>
              <button
                onClick={() => setTotalsView('summary')}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 ${totalsView === 'summary' ? '' : 'border'}`}
                style={totalsView === 'summary' ? { background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' } : { borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <CalendarRange size={16} strokeWidth={2.5} /> Monthly &amp; Yearly
              </button>
            </div>

            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'rgba(245,243,238,0.03)', border: '1px dashed rgba(245,243,238,0.15)' }}
            >
              {dailyTotals.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  Nothing logged yet.
                </p>
              )}

              {totalsView === 'summary' && (
                <div ref={totalsScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                  {yearlyTotals.map((y) => (
                    <div key={y.key}>
                      <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'rgba(1,169,157,0.08)' }}>
                        <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: '#01A99D' }}>
                          {y.key}
                        </span>
                        <div className="flex flex-col items-end">
                          <span className="mono-num text-sm font-bold" style={{ color: '#01A99D' }}>
                            {currencyOf(defaultCurrency).symbol}
                            {fmt(y.total)}
                          </span>
                          {Object.entries(y.otherCurrencies).map(([code, o]) => (
                            <span key={code} className="mono-num text-xs font-semibold" style={{ color: '#01A99D' }}>
                              {currencyOf(code).symbol}
                              {fmt(o.total)}
                            </span>
                          ))}
                        </div>
                      </div>
                      {monthlyTotals
                        .filter((m) => m.key.startsWith(y.key + '-'))
                        .map((m) => (
                          <div
                            key={m.key}
                            ref={(el) => {
                              monthRefs.current[m.key] = el;
                            }}
                            className="px-4 py-4"
                            style={{ borderBottom: '1px dashed rgba(245,243,238,0.08)' }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                                  {MONTH_FMT.format(m.date)}
                                </span>
                                <button
                                  onClick={() => {
                                    const first = entries.find((en) => monthKeyOf(new Date(en.id)) === m.key);
                                    if (first) setScrollToDay(new Date(first.id).toDateString());
                                    setScreen(4);
                                  }}
                                  className="text-xs text-left underline underline-offset-2"
                                  style={{ color: '#7C8883' }}
                                >
                                  {m.count} {m.count === 1 ? 'purchase' : 'purchases'}
                                </button>
                              </div>
                              <span className="mono-num text-lg font-bold" style={{ color: '#01A99D' }}>
                                {currencyOf(defaultCurrency).symbol}
                                {fmt(m.total)}
                              </span>
                            </div>
                            {Object.keys(m.otherCurrencies).length > 0 && (
                              <div className="flex flex-col items-end mt-1">
                                {Object.entries(m.otherCurrencies).map(([code, o]) => (
                                  <span key={code} className="mono-num text-sm font-semibold" style={{ color: '#01A99D' }}>
                                    {currencyOf(code).symbol}
                                    {fmt(o.total)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}

              {totalsView === 'daily' && (
              <div
                ref={totalsScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
                onScroll={(ev) => loadMoreOnScroll(ev, dailyTotals.length, setDailyLimit, 45)}
              >
                {dailyTotals.slice(0, dailyLimit).map((d, i) => {
                  const monthKey = monthKeyOf(d.date);
                  const prevMonthKey = i > 0 ? monthKeyOf(dailyTotals[i - 1].date) : null;
                  const isNewMonth = monthKey !== prevMonthKey;
                  return (
                    <div key={d.key}>
                      {isNewMonth && (
                        <div
                          ref={(el) => {
                            monthRefs.current[monthKey] = el;
                          }}
                          className="px-4 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold"
                          style={{ background: 'rgba(1,169,157,0.08)', color: '#01A99D' }}
                        >
                          {monthLabelOf(d.date)}
                        </div>
                      )}
                      <div
                        className="px-4 py-4"
                        style={{ borderBottom: '1px dashed rgba(245,243,238,0.08)' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                              {dayLabel(d.date)}
                            </span>
                            <button
                              onClick={() => {
                                setScrollToDay(d.key);
                                setScreen(4);
                              }}
                              className="text-xs text-left underline underline-offset-2"
                              style={{ color: '#7C8883' }}
                            >
                              {d.count} {d.count === 1 ? 'purchase' : 'purchases'}
                            </button>
                          </div>
                          <span className="mono-num text-lg font-bold" style={{ color: '#01A99D' }}>
                            {currencyOf(defaultCurrency).symbol}
                            {fmt(d.total)}
                          </span>
                        </div>

                        {Object.keys(d.otherCurrencies).length > 0 && (
                          <div className="flex flex-col items-end mt-1">
                            {Object.entries(d.otherCurrencies).map(([code, o]) => (
                              <span key={code} className="mono-num text-sm font-semibold" style={{ color: '#01A99D' }}>
                                {currencyOf(code).symbol}
                                {fmt(o.total)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        )}

        {screen === 1 && <ConfirmCircle show={!!selectedItem} onClick={confirmScreen1} label="Confirm item" raised={demo} />}
        {screen === 2 && (
          <ConfirmCircle
            show={qtyValid}
            onClick={confirmScreenQty}
            label="Confirm quantity"
            raised={demo}
            onDecrement={() => adjustQuantity(-1)}
            onIncrement={() => adjustQuantity(1)}
          />
        )}
        {screen === 3 && <ConfirmCircle show={priceValid} onClick={confirmScreenPrice} label="Confirm price" raised={demo} />}

        <CurrencyPicker
          open={showCurrencyPicker}
          value={entryCurrency}
          onCancel={() => setShowCurrencyPicker(false)}
          onSelect={(code) => {
            setEntryCurrency(code);
            setShowCurrencyPicker(false);
          }}
        />

        <LoggerSwitcher
          open={showLoggerSwitcher}
          loggers={loggers}
          activeLoggerId={activeLoggerId}
          onSelect={switchLogger}
          onCreate={createLogger}
          newName={newLoggerName}
          setNewName={setNewLoggerName}
          onCancel={() => setShowLoggerSwitcher(false)}
        />

        <MonthYearPicker
          open={showMonthPicker}
          availableMonths={availableMonths}
          onCancel={() => setShowMonthPicker(false)}
          onSelect={(monthKey) => {
            setScrollToMonth(monthKey);
            setShowMonthPicker(false);
          }}
        />

        {showFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowFeedback(false)}>
            <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }} onClick={(ev) => ev.stopPropagation()}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                Send feedback
              </p>
              <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                Tell us what’s working, what isn’t, or what you’d like to see. (You can also send a direct email to oge.o.onuora@gmail.com with your feedback - that’s the creator’s email.)
              </p>
              <textarea
                value={feedbackText}
                onChange={(ev) => setFeedbackText(ev.target.value)}
                placeholder="Your feedback"
                className="feedback-input w-full h-32 rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
                style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope', resize: 'none' }}
              />
              <div className="flex gap-2.5">
                <button onClick={() => setShowFeedback(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}>
                  Cancel
                </button>
                <button
                  onClick={sendFeedback}
                  disabled={!feedbackText.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope', opacity: feedbackText.trim() ? 1 : 0.4 }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={!!nullifyTarget}
          title={nullifyTarget && nullifyTarget.nullified ? `Restore '${nullifyTarget.name}'?` : `Nullify '${nullifyTarget ? nullifyTarget.name : ''}'?`}
          message={
            nullifyTarget && nullifyTarget.nullified
              ? 'It will be counted in totals again.'
              : 'It stays in the list, but isn\u2019t counted in totals. You can restore it any time.'
          }
          confirmLabel={nullifyTarget && nullifyTarget.nullified ? 'Restore' : 'Nullify'}
          onCancel={() => setNullifyEntryId(null)}
          onConfirm={toggleNullifyEntry}
        />

        <ConfirmModal
          open={!!itemPendingDelete}
          title={`Remove '${itemPendingDelete}'?`}
          message={`It won't show up as a suggestion anymore. Past entries that include '${itemPendingDelete}' will not be deleted.`}
          confirmLabel="Remove"
          onCancel={() => setItemPendingDelete(null)}
          onConfirm={() => deleteItem(itemPendingDelete)}
        />

        <ConfirmModal
          open={showCancelConfirm}
          title="Skip to the ledger?"
          message="Your current entry will be cancelled."
          confirmLabel="Cancel entry"
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={confirmCancelEntry}
        />

        {showSettings && (
          <SettingsScreen
            onClose={() => setShowSettings(false)}
            loggers={loggers}
            editingLoggerId={editingLoggerId}
            loggerNameDraft={loggerNameDraft}
            setLoggerNameDraft={setLoggerNameDraft}
            onStartRename={startRenameLedger}
            onSaveRename={saveRenameLedger}
            onRequestDeleteLedger={(id) => setLedgerPendingDelete(id)}
            onReplayWalkthrough={replayWalkthrough}
            onOpenExport={openExport}
            onOpenImport={() => {
              setShowSettings(false);
              setShowImport(true);
            }}
            onRequestDeleteAccount={() => setShowDeleteAccount(true)}
            onOpenFeedback={() => setShowFeedback(true)}
          />
        )}

        {!demo && (
          <button
            onClick={onOpenDemo}
            className="absolute text-[11px] underline underline-offset-2"
            style={{ bottom: 8, left: '50%', transform: 'translateX(-50%)', color: 'rgba(124,136,131,0.55)', fontFamily: 'Manrope', zIndex: 10 }}
          >
            Demo
          </button>
        )}

        {demo && (
          <>
            <button
              onClick={onExitDemo}
              className="fixed text-xs font-semibold underline underline-offset-2 px-3 py-1 rounded-full"
              style={{
                bottom: 3,
                left: '50%',
                transform: 'translateX(-50%)',
                color: '#01A99D',
                background: 'rgba(15,18,16,0.9)',
                border: '1px solid rgba(1,169,157,0.3)',
                fontFamily: 'Manrope',
                zIndex: 90,
              }}
            >
              Exit Demo
            </button>
            {demoToast && (
              <div
                className="fixed left-1/2 w-full max-w-xs px-4"
                style={{ top: 24, transform: 'translateX(-50%)', zIndex: 95 }}
                role="status"
              >
                <div
                  className="rounded-2xl px-4 py-3 text-sm text-center shadow-2xl"
                  style={{ background: '#171C19', border: '1px solid rgba(1,169,157,0.4)', color: '#F5F3EE', fontFamily: 'Manrope' }}
                >
                  You can’t add entries in the demo. Switch to the real app to start logging.
                </div>
              </div>
            )}
          </>
        )}

        {(screen === 4 || screen === 5) && !showSettings && (
          <button
            onClick={backToTop}
            className="fixed flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-xl"
            style={{
              bottom: 16,
              // Bottom-right of the app column (max-w-sm = 384px), or of the screen on phones.
              right: 'max(16px, calc(50% - 176px))',
              background: '#171C19',
              border: '1px solid rgba(245,243,238,0.15)',
              color: '#F5F3EE',
              fontFamily: 'Manrope',
              zIndex: 40,
            }}
          >
            <ArrowUp size={14} color="#01A99D" strokeWidth={3} /> Back to top
          </button>
        )}

        <Walkthrough open={showWalkthrough} step={walkthroughStep} setStep={setWalkthroughStep} onDismiss={dismissWalkthrough} />

        <ConfirmModal
          open={!!ledgerPendingDelete}
          title={`Delete '${loggers.find((l) => l.id === ledgerPendingDelete)?.name || ''}'?`}
          message="This deletes all its items and entries. This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setLedgerPendingDelete(null)}
          onConfirm={confirmDeleteLedger}
        />

        <ConfirmModal
          open={showDeleteAccount}
          title="Delete your account?"
          message="This permanently deletes every ledger and everything in them, on this device. Consider copying your data first."
          confirmLabel="Delete everything"
          onCancel={() => setShowDeleteAccount(false)}
          onConfirm={confirmDeleteAccount}
        />

        {showImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowImport(false)}>
            <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }} onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>Restore from backup</p>
              <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                Choose a backup file downloaded from another account. This replaces all data currently on this device.
              </p>
              <input ref={importFileRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
              <button
                onClick={() => importFileRef.current && importFileRef.current.click()}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 mb-3"
                style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
              >
                <Upload size={14} /> Choose backup file
              </button>
              {importError && <p className="text-xs mb-2" style={{ color: '#F87171', fontFamily: 'Manrope' }}>{importError}</p>}
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setShowImport(false);
                    setImportError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KeyBtn({ label, onPress, icon, children, muted, small, full }) {
  return (
    <button
      onClick={onPress}
      className="rounded-2xl flex items-center justify-center active:scale-95 transition-transform mono-num"
      style={{
        height: full ? '3.5rem' : '3.5rem',
        width: '100%',
        background: muted ? 'rgba(245,243,238,0.04)' : 'rgba(245,243,238,0.07)',
        color: muted ? '#7C8883' : '#F5F3EE',
        fontSize: small ? '0.95rem' : '1.15rem',
        fontWeight: 600,
      }}
    >
      {icon ? children : label}
    </button>
  );
}

export default function LedgerLog() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <>
      <LedgerApp onOpenDemo={() => setDemoOpen(true)} />
      {demoOpen && (
        <div
          className="fixed inset-0 overflow-y-auto"
          style={{ background: '#0A0C0B', zIndex: 60 }}
          role="dialog"
          aria-modal="true"
          aria-label="Demo"
        >
          <LedgerApp demo onExitDemo={() => setDemoOpen(false)} />
        </div>
      )}
    </>
  );
}

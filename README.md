# Ledger Log (UI/UX prototype)

A quick purchase-logging prototype: pick an item, enter quantity and price on an on-screen keypad, and review entries, daily totals and monthly/yearly totals per ledger. It's a front-end demo only, with no backend or accounts.

- Tap **Demo** (small underlined text at the bottom of Step 1) to explore pre-filled data covering three years and several currencies. Nothing in the demo touches your real data.
- Everything you log is saved in your browser's `localStorage` (keys start with `ledgerlog-demo:`). Settings has a backup file download/restore if you want to move data between browsers.
- The fonts (Manrope, Space Mono) load from Google Fonts, so they need an internet connection.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build and host

```bash
npm run build    # outputs ./dist
npm run preview  # serve the build locally
```

`dist/` is a plain static site with relative paths, so it works on GitHub Pages (also from a repo sub-path), Netlify, Vercel, Cloudflare Pages or any static host.

**GitHub Pages quick route:** build, then publish the contents of `dist/` to a `gh-pages` branch (or use any Pages deploy action). Set the Pages source to that branch.

## Notes

- Built with React 18, Vite, Tailwind CSS v4 and lucide-react.
- `src/LedgerLog.jsx` is the whole app. It was written as a Claude artifact that used `window.storage`; `src/storage.js` recreates that small API on top of `localStorage`, so the app code is unchanged.
- It's a prototype: no tests, accessibility audit or error reporting.

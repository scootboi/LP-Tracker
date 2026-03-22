# Scott's LP Tracker

Live liquidity pool dashboard with real-time prices from CoinGecko.

## Deploy to Vercel

1. Upload this entire folder to a GitHub repository
2. Go to vercel.com → New Project → Import your GitHub repo
3. Framework: Vite (auto-detected)
4. Click Deploy — live in ~60 seconds

## Update your positions

Edit `src/App.jsx` and find the `POOLS` array at the top.
Update `deposited`, `collectedFees`, `rangeLow`, `rangeHigh` as needed.
Push to GitHub → Vercel redeploys automatically.

## Local development

```
npm install
npm run dev
```

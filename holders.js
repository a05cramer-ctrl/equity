// GET /api/holders?mint=<mint> -> { supply, holders:[{owner, amount, pct}] }  (top 20, live)
// Needs env var HELIUS_API_KEY on Vercel.
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
export default async function handler(req, res) {
  const mint = String(req.query.mint || '');
  if (!B58.test(mint)) return res.status(400).json({ error: 'bad mint' });
  const key = process.env.HELIUS_API_KEY;
  if (!key) return res.status(500).json({ error: 'HELIUS_API_KEY not set' });
  const url = 'https://mainnet.helius-rpc.com/?api-key=' + key;
  try {
    const [largest, supply] = await Promise.all([rpc(url, 'getTokenLargestAccounts', [mint]), rpc(url, 'getTokenSupply', [mint])]);
    const accs = largest.value || [];
    const info = await rpc(url, 'getMultipleAccounts', [accs.map((a) => a.address), { encoding: 'jsonParsed' }]);
    const total = supply.value.uiAmount || 1;
    const byOwner = new Map();
    accs.forEach((a, i) => {
      const owner = info.value[i]?.data?.parsed?.info?.owner; if (!owner) return;
      byOwner.set(owner, (byOwner.get(owner) || 0) + (a.uiAmount || 0));
    });
    const holders = [...byOwner].map(([owner, amount]) => ({ owner, amount, pct: amount / total * 100 })).sort((x, y) => y.amount - x.amount);
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ supply: total, holders });
  } catch (e) { res.status(502).json({ error: 'upstream' }); }
}

// GET /api/vault?wallet=<address> -> { sol, payouts24h, paid24h }
// Needs env var HELIUS_API_KEY on Vercel. Counts SOL that left the vault in the last 24h.
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export default async function handler(req, res) {
  const wallet = String(req.query.wallet || '');
  if (!B58.test(wallet)) return res.status(400).json({ error: 'bad wallet' });
  const key = process.env.HELIUS_API_KEY;
  if (!key) return res.status(500).json({ error: 'HELIUS_API_KEY not set' });
  try {
    const rpc = await fetch('https://mainnet.helius-rpc.com/?api-key=' + key, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [wallet] }) }).then((r) => r.json());
    const sol = (rpc.result?.value || 0) / 1e9;
    const since = Date.now() / 1000 - 86400;
    const txs = await fetch(`https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${key}&limit=100`).then((r) => r.json());
    let payouts = 0, paid = 0;
    for (const t of Array.isArray(txs) ? txs : []) {
      if (t.timestamp < since) break;
      const out = (t.nativeTransfers || []).filter((n) => n.fromUserAccount === wallet && n.toUserAccount !== wallet);
      if (out.length) { payouts++; paid += out.reduce((s, n) => s + n.amount, 0) / 1e9; }
    }
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ sol, payouts24h: payouts, paid24h: paid });
  } catch (e) { res.status(502).json({ error: 'upstream' }); }
}

import express from 'express'
const app = express()
app.use(express.json())
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai_service', model: process.env.AI_MODEL || 'gpt-4o-mini' }))
app.post('/evaluate', (req, res) => {
  const score = Number(req.body?.deal_score || 0)
  const evaluation = score >= 88 ? { label:'Jetzt kaufen', verdict:'buy' } : score >= 78 ? { label:'Guter Kauf', verdict:'consider' } : { label:'Beobachten', verdict:'watch' }
  res.json({ ok: true, evaluation })
})
app.listen(3010, () => console.log('ai service on 3010'))

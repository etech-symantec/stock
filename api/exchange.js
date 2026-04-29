// api/exchange.js
export default async function handler(req, res) {
  try {
    const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=3y&interval=1d';
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) throw new Error('Yahoo API error');
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

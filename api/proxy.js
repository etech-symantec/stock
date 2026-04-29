export default async function handler(req, res) {
  // 클라이언트(app.js)에서 보낸 타겟 URL을 받습니다.
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Vercel 서버에서 야후 파이낸스로 직접 요청을 보냅니다. (CORS 문제 없음)
    const response = await fetch(url, {
      headers: {
        // 야후 서버가 봇으로 튕겨내지 못하도록 일반 브라우저처럼 위장
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`야후 서버 응답 오류: ${response.statusText}`);
    }

    const data = await response.json();

    // 내 프론트엔드에서 이 데이터를 받을 수 있도록 CORS 헤더 허용
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
    
  } catch (error) {
    console.error('Vercel Proxy Error:', error);
    res.status(500).json({ error: '데이터를 가져오는데 실패했습니다.' });
  }
}

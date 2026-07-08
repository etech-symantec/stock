// api/news.js
// 구글 뉴스 RSS를 "서버"에서 대신 가져와 JSON으로 바꿔주는 함수입니다.
// 브라우저에서 news.google.com을 직접 fetch하면 CORS 정책 때문에 막히지만,
// 같은 도메인(jooseek.vercel.app)의 서버리스 함수를 거치면 브라우저 입장에서는
// "같은 출처(same-origin)" 요청이라 CORS 문제가 아예 발생하지 않습니다.
//
// 이 파일을 프로젝트의 /api/news.js 경로에 그대로 추가하고 배포하면,
// moonlight.html에서 /api/news?q=검색어 형태로 바로 호출할 수 있습니다.

export default async function handler(req, res) {
  const { q } = req.query;

  if (!q || !String(q).trim()) {
    res.status(400).json({ error: 'q(검색어) 파라미터가 필요합니다.' });
    return;
  }

  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    const response = await fetch(rssUrl, {
      headers: {
        // 일부 서버는 User-Agent가 없으면 요청을 막기도 해서 브라우저처럼 보이도록 지정합니다.
        'User-Agent': 'Mozilla/5.0 (compatible; JooseekNewsBot/1.0; +https://jooseek.vercel.app)'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: `구글 뉴스 응답 오류: ${response.status}` });
      return;
    }

    const xml = await response.text();

    // Vercel의 Node.js 서버리스 환경에는 브라우저의 DOMParser가 없으므로,
    // <item>...</item> 블록을 정규식으로 간단히 추출합니다.
    // (구글 뉴스 RSS는 형식이 일정해서 이 정도 파싱으로 충분합니다)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    const pickTag = (block, tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1]
        .replace('<![CDATA[', '')
        .replace(']]>', '')
        .trim();
    };

    while ((match = itemRegex.exec(xml)) && items.length < 5) {
      const block = match[1];
      items.push({
        title: pickTag(block, 'title'),
        link: pickTag(block, 'link'),
        pubDate: pickTag(block, 'pubDate'),
        source: pickTag(block, 'source')
      });
    }

    // 10분 정도 캐싱해서 같은 검색어로 반복 호출될 때 구글에 매번 요청하지 않도록 합니다.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : '알 수 없는 오류가 발생했습니다.' });
  }
}

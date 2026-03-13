import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    
    // Tavily API'sine istek atıyoruz (Sadece en iyi cevapları almak için optimize edilmiştir)
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        include_answer: true,
      }),
    });
    
    if (!res.ok) {
      throw new Error(`API Hatası: ${res.status}`);
    }

    const data = await res.json();
    
    // Eğer Tavily özel bir yapay zeka özeti sunduysa onu, sunmadıysa arama sonuçlarını döndür
    const finalContext = data.answer || data.results.map((r: any) => `- ${r.title}: ${r.content}`).join("\n");
    
    return NextResponse.json({ context: finalContext || "Kesin bir bilgi bulunamadı." });
  } catch (error) {
    console.error("Arama motoru hatası:", error);
    return NextResponse.json({ context: "" }, { status: 500 });
  }
}
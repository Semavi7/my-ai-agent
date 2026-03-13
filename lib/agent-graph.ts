import { StateGraph, Annotation } from "@langchain/langgraph/web";
import type { MLCEngine } from "@mlc-ai/web-llm";

// 1. Ajanın Hafızası (Durum Yönetimi)
export const AgentState = Annotation.Root({
  query: Annotation<string>(),
  needsSearch: Annotation<boolean>(),
  searchContext: Annotation<string>(),
  finalResponse: Annotation<string>(),
});

// Yardımcı Fonksiyon: Karar Verici Prompt (Sıfır yaratıcılık ile kesin cevap istenir)
async function askIfNeedsSearch(engine: MLCEngine, query: string): Promise<boolean> {
  const prompt = `Sen zeki bir asistansın. Kullanıcının şu sorusunu cevaplamak için güncel veya kesin bilgilere (internette aramaya) ihtiyacın var mı? 
  Eğer genel geçer bir bilgi, kod yazımı, çeviri veya normal bir sohbet ise 'HAYIR' yaz. 
  Eğer güncel bir haber, hava durumu, bilmediğin bir olgu veya araştırılması gereken spesifik bir veri ise 'EVET' yaz.
  Soru: "${query}"
  SADECE 'EVET' veya 'HAYIR' YAZ.`;

  const response = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0, // Karar verirken uydurma yapmasını engelliyoruz
  });
  
  return response.choices[0].message.content?.includes("EVET") || false;
}

// 2. LangGraph Ajanını Oluşturma Fonksiyonu
export const createAgentGraph = (
  engine: MLCEngine, 
  onStatusUpdate: (msg: string) => void,
  onToken: (fullText: string) => void
) => {
  
  // Düğüm 1: Karar Aşaması
  const routerNode = async (state: typeof AgentState.State) => {
    onStatusUpdate("Düşünüyorum (Araştırma yapmalı mıyım?)...");
    const needsSearch = await askIfNeedsSearch(engine, state.query);
    return { needsSearch };
  };

  // Düğüm 2: Arama Aşaması (Sadece needsSearch true ise çalışır)
  const searchNode = async (state: typeof AgentState.State) => {
    onStatusUpdate("İnternette derinlemesine araştırılıyor (Tavily)...");
    const res = await fetch("/api/search", {
      method: "POST",
      body: JSON.stringify({ query: state.query }),
    });
    const data = await res.json();
    return { searchContext: data.context };
  };

  // Düğüm 3: Yanıt Üretme ve Akış (Streaming) Aşaması
  const generateNode = async (state: typeof AgentState.State) => {
    onStatusUpdate("Yanıt oluşturuluyor...");
    
    let systemPrompt = "Sen yardımsever, zeki ve Türkçe konuşan bir asistansın. Her zaman açıklayıcı ve kibar ol.";
    
    // Eğer internetten veri geldiyse, modele bunu kullanarak cevap vermesini emrediyoruz
    if (state.searchContext) {
      systemPrompt += `\nLütfen sadece aşağıdaki internet sonuçlarını dikkate alarak cevap ver. Uydurma yapma:\n\n--- İNTERNET SONUÇLARI ---\n${state.searchContext}\n--------------------------`;
    }

    const chunks = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: state.query }
      ],
      temperature: 0.7, // Akıcı ve yaratıcı bir metin için
      stream: true,     // Streaming AKTİF
    });

    let fullResponse = "";
    // Kelimeler modelden geldikçe UI tarafındaki callback'i tetikliyoruz
    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content || "";
      fullResponse += delta;
      onToken(fullResponse); 
    }

    return { finalResponse: fullResponse };
  };

  // 3. Koşullu Yönlendirme Mantığı
  const shouldSearch = (state: typeof AgentState.State) => {
    return state.needsSearch ? "search_node" : "generate_node";
  };

  // 4. Grafı İnşa Et ve Derle
  const workflow = new StateGraph(AgentState)
    .addNode("router_node", routerNode)
    .addNode("search_node", searchNode)
    .addNode("generate_node", generateNode)
    
    .addEdge("__start__", "router_node")
    .addConditionalEdges("router_node", shouldSearch)
    .addEdge("search_node", "generate_node")
    .addEdge("generate_node", "__end__");

  return workflow.compile();
};
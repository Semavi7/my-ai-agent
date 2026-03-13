"use client";

import { useState, useRef, useEffect } from "react";
import { initEngine, AVAILABLE_MODELS, ModelKey } from "@/lib/webllm-engine";
import { createAgentGraph } from "@/lib/agent-graph";
import { Send, Bot, User, Loader2, Globe, Sparkles, BrainCircuit } from "lucide-react";
import type { MLCEngine } from "@mlc-ai/web-llm";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [loadingText, setLoadingText] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelKey>("smol");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Yeni mesaj geldiğinde otomatik olarak en alta kaydır
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentStatus]);

  // Modeli İndirme ve Başlatma İşlemi
  const loadModel = async () => {
    setLoadingText("WebGPU kontrol ediliyor ve model hazırlanıyor...");
    try {
      const e = await initEngine(selectedModel, (text, progress) => {
        setLoadingText(`${text} (%${Math.round(progress * 100)})`);
      });
      setEngine(e);
      setLoadingText("");
      setMessages([{ role: "assistant", content: "Merhaba! Tarayıcı tabanlı otonom yapay zeka ajanınız hazır. Size nasıl yardımcı olabilirim?" }]);
    } catch (error) {
      console.error(error);
      setLoadingText("Model yüklenirken bir hata oluştu. Tarayıcınız WebGPU desteklemiyor olabilir.");
    }
  };

  // Mesaj Gönderme ve Ajanı Tetikleme İşlemi
  const handleSend = async () => {
    if (!input.trim() || !engine) return;

    const userQuery = input.trim();
    setInput("");
    
    // Kullanıcı mesajını ekle
    setMessages((prev) => [...prev, { role: "user", content: userQuery }]);
    setIsTyping(true);

    // Asistan için ekrana hemen boş bir mesaj balonu ekle
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // LangGraph ajanını başlatıyoruz
    const app = createAgentGraph(
      engine, 
      (status) => setAgentStatus(status), // Aşama güncellemeleri
      (fullText) => {                     // Gerçek zamanlı akış (Streaming)
        setMessages((prev) => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].content = fullText;
          return newMsgs;
        });
      }
    );

    try {
      // Ajanı çalıştır
      await app.invoke({
        query: userQuery,
        needsSearch: false,
        searchContext: "",
        finalResponse: ""
      });
      setAgentStatus(""); // İşlem bitince durumu temizle
    } catch (error) {
      console.error(error);
      setAgentStatus("Ajan çalışırken hata oluştu.");
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "İşlem sırasında beklenmeyen bir hata oluştu.";
        return newMsgs;
      });
    }

    setIsTyping(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 max-w-4xl mx-auto border-x shadow-2xl">
      {/* Üst Menü / Header */}
      <div className="bg-white p-4 border-b flex flex-col sm:flex-row items-center justify-between gap-4 z-10 shadow-sm">
        <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
          <BrainCircuit className="text-indigo-600" /> Ajan tabanlı WebLLM
        </h1>
        
        {!engine ? (
          <div className="flex gap-2 w-full sm:w-auto">
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value as ModelKey)}
              className="border border-slate-300 bg-slate-50 rounded-lg p-2 text-sm flex-1 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="smol">{AVAILABLE_MODELS.smol.name}</option>
              <option value="llama">{AVAILABLE_MODELS.llama.name}</option>
              <option value="phi3">{AVAILABLE_MODELS.phi3.name}</option>
              <option value="llama3b">{AVAILABLE_MODELS.llama3b.name}</option>
              <option value="qwen">{AVAILABLE_MODELS.qwen.name}</option>
              <option value="qwenMax">{AVAILABLE_MODELS.qwenMax.name}</option>
            </select>
            <button 
              onClick={loadModel} 
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2"
            >
              <Bot size={18} /> Başlat
            </button>
          </div>
        ) : (
          <span className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-medium border border-green-200">
            <Sparkles size={16}/> Sistem Aktif & Çevrimiçi
          </span>
        )}
      </div>

      {/* Sohbet Alanı */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {loadingText && (
          <div className="h-full flex flex-col items-center justify-center text-indigo-600 gap-4">
            <Loader2 className="animate-spin" size={40} /> 
            <p className="font-medium animate-pulse">{loadingText}</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200">
                <Bot size={18} className="text-indigo-600" />
              </div>
            )}
            
            <div className={`p-4 rounded-2xl max-w-[85%] sm:max-w-[75%] leading-relaxed ${
              msg.role === "user" 
                ? "bg-indigo-600 text-white rounded-tr-sm shadow-md" 
                : "bg-white text-slate-800 rounded-tl-sm shadow-sm border border-slate-200"
            }`}>
              {/* Sadece boşluk geliyorsa (streaming başlangıcı) */}
              {msg.role === "assistant" && !msg.content && isTyping ? (
                 <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse" />
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 border border-slate-300">
                <User size={18} className="text-slate-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Yazma / Input Alanı */}
      <div className="p-4 bg-white border-t relative">
        {/* Ajanın o an ne yaptığına dair bilgilendirme */}
        {agentStatus && (
          <div className="absolute -top-10 left-0 w-full flex justify-center pointer-events-none">
            <span className="bg-indigo-100/90 backdrop-blur-sm text-indigo-700 text-xs font-medium px-4 py-1.5 rounded-full flex items-center gap-2 shadow-sm border border-indigo-200">
              <Globe size={14} className="animate-spin" /> {agentStatus}
            </span>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={!engine || isTyping}
            placeholder={engine ? "Bir soru sorun (örn: LangGraph nedir?)" : "Sohbet etmek için yukarıdan modeli başlatın..."}
            className="flex-1 border border-slate-300 bg-slate-50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 resize-none max-h-32"
            rows={1}
          />
          <button 
            onClick={handleSend} 
            disabled={!engine || isTyping || !input.trim()}
            className="bg-indigo-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition flex shrink-0 shadow-md"
          >
            {isTyping && !agentStatus ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-slate-400">Veriler tarayıcınızdan çıkmaz. Bilinmeyen konularda Tavily üzerinden arama yapılır.</p>
        </div>
      </div>
    </div>
  );
}
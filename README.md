# My AI Agent

Tarayıcı tabanlı, tamamen istemci-taraflı çalışan otonom yapay zeka sohbet uygulaması. LLM modelleri **WebGPU** aracılığıyla doğrudan kullanıcının tarayıcısında çalışır — bulut LLM API'sine gerek yoktur. Ajan mantığı **LangGraph** ile orkestre edilir ve gerektiğinde **Tavily** aracılığıyla gerçek zamanlı web araması yapılır.

---

## Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────┐
│                    Tarayıcı (İstemci)               │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │   UI Layer   │    │   LangGraph Agent Graph  │   │
│  │  (page.tsx)  │    │                          │   │
│  │              │    │  [router_node]           │   │
│  │  • Model     │    │      │                   │   │
│  │    Seçici    │    │      ▼ (koşullu)         │   │
│  │  • Sohbet    │    │  [search_node] ──────┐   │   │
│  │    Arayüzü   │    │      │               │   │   │
│  │  • Akış      │    │      ▼               ▼   │   │
│  │    Tokenleri │    │  [generate_node]         │   │
│  └──────────────┘    └──────────────────────────┘   │
│                                │                    │
│              ┌─────────────────┘                    │
│              ▼                                      │
│  ┌──────────────────────┐                           │
│  │  WebLLM Engine       │                           │
│  │  (@mlc-ai/web-llm)   │                           │
│  │  • WebGPU üzerinde   │                           │
│  │    LLM çalıştırır    │                           │
│  │  • Model ağırlıkları │                           │
│  │    tarayıcıda önbel. │                           │
│  └──────────────────────┘                           │
└─────────────────────────────────────────────────────┘
                        │ (yalnızca arama gerektiğinde)
                        ▼
┌─────────────────────────────────────────────────────┐
│                Sunucu (Next.js API)                 │
│                                                     │
│  POST /api/search                                   │
│  └── Tavily Search API'ye istek atar                │
│      API anahtarı sunucuda güvende kalır            │
└─────────────────────────────────────────────────────┘
```

---

## Özellikler

- **%100 İstemci Taraflı LLM**: Model ağırlıkları tarayıcıya indirilir ve WebGPU shader'ları ile çalıştırılır. Hiçbir token bulut LLM servisine gönderilmez.
- **Otonom Arama Kararı**: Ajan, kullanıcının sorusunu analiz ederek web aramasının gerekip gerekmediğine otomatik olarak karar verir.
- **Gerçek Zamanlı Akış**: Üretilen tokenlar arayüze anlık olarak yansıtılır.
- **Çoklu Model Desteği**: 360MB ile 2.5GB arasında 6 farklı model arasından seçim yapılabilir.
- **GPU Shader Önbellek Kurtarma**: Shader derleme hatalarında ilgili önbellekler otomatik temizlenir ve yeniden deneme yapılır.
- **Türkçe Arayüz**: Tüm UI metinleri ve sistem promptları Türkçedir.

---

## Teknoloji Yığını

| Katman | Teknoloji | Sürüm |
|--------|-----------|-------|
| Framework | Next.js | 16.1.6 |
| UI | React | 19.2.3 |
| Stil | Tailwind CSS | v4 |
| Dil | TypeScript | ^5 |
| Tarayıcı LLM | @mlc-ai/web-llm | ^0.2.81 |
| Ajan Mantığı | @langchain/langgraph | ^1.2.2 |
| LLM Primitive | @langchain/core | ^1.1.32 |
| Web Arama | Tavily Search API | — |
| İkonlar | lucide-react | ^0.577.0 |

---

## Proje Yapısı

```
my-ai-agent/
├── app/
│   ├── api/
│   │   └── search/
│   │       └── route.ts        # Tavily arama proxy'si (POST /api/search)
│   ├── globals.css             # Tailwind v4 importu + tema değişkenleri
│   ├── layout.tsx              # Root layout, Geist fontları
│   └── page.tsx                # Ana sohbet arayüzü (Client Component)
├── lib/
│   ├── agent-graph.ts          # LangGraph ajan tanımı (router → search → generate)
│   └── webllm-engine.ts        # WebLLM singleton + model listesi
├── public/                     # Statik SVG varlıklar (scaffold)
├── .env.local                  # TAVILY_API_KEY (git'e dahil edilmez)
├── next.config.ts              # Next.js yapılandırması
├── tsconfig.json               # TypeScript yapılandırması
└── package.json
```

---

## Ajan Akışı

Her kullanıcı mesajı geldiğinde LangGraph aşağıdaki grafı çalıştırır:

```
__start__
    │
    ▼
router_node ──── LLM'e sorar: "Bu soru için web araması gerekli mi?"
    │                          Cevap: EVET / HAYIR (sıcaklık=0)
    │
    ├─ EVET ──▶ search_node ──▶ /api/search ──▶ Tavily API
    │                               │
    │                               ▼ (searchContext doldurulur)
    │
    └─ HAYIR ──▶ generate_node ◀──── (search_node'dan da gelir)
                    │
                    ▼ (stream: true, sıcaklık=0.7)
                 __end__
```

### Düğüm Detayları

**`router_node`**

- Model ağırlıkları kullanılarak sıfır sıcaklıkta çalışır.
- System prompt: `"Sadece EVET veya HAYIR ile cevap ver."`
- Çıktı: `needsSearch: boolean`

**`search_node`** *(koşullu — yalnızca `needsSearch === true`)*

- Next.js API route'una `POST /api/search` isteği atar.
- Sunucu tarafı `TAVILY_API_KEY` kullanılır; anahtar tarayıcıya hiç ulaşmaz.
- Tavily'nin AI özeti öncelikli olarak döndürülür; yoksa ilk `n` sonucun başlık+içerik listesi kullanılır.
- Çıktı: `searchContext: string`

**`generate_node`**

- `searchContext` varsa prompt'a bağlam eklenir ve model yalnızca bu bilgiyle cevap üretir.
- `stream: true` ile üretilen her token `onToken` callback'i üzerinden arayüze iletilir.
- Çıktı: `finalResponse: string`

---

## Desteklenen Modeller

| Anahtar | Model ID | Görünen Ad | Boyut |
|---------|----------|------------|-------|
| `smol` | SmolLM2-360M-Instruct-q4f32_1-MLC | SmolLM2-360M (Hızlı) | ~360 MB |
| `llama` | Llama-3.2-1B-Instruct-q4f32_1-MLC | Llama-3.2-1B (Akıllı) | ~1.5 GB |
| `phi3` | Phi-3-mini-4k-instruct-q4f32_1-MLC | Microsoft Phi-3 (Mantık Uzmanı) | ~2.5 GB |
| `llama3b` | Llama-3.2-3B-Instruct-q4f32_1-MLC | Llama-3.2-3B (Çok Zeki) | ~2.5 GB |
| `qwen` | Qwen2.5-1.5B-Instruct-q4f32_1-MLC | Qwen-2.5-1.5B (Türkçe Ustası) | ~1.5 GB |
| `qwenMax` | Qwen2.5-3B-Instruct-q4f32_1-MLC | Qwen-2.5-3B (Maksimum Güç) | ~2.5 GB |

Model ağırlıkları ilk yüklemede MLC CDN'den indirilir ve tarayıcının Cache API'sinde (ya da IndexedDB'de) saklanır. Sonraki oturumlar için tekrar indirme gerekmez.

---

## Kurulum

### Gereksinimler

- **Node.js** >= 18
- WebGPU destekleyen bir tarayıcı (Chrome 113+, Edge 113+, Chrome Android 121+)
- Tavily API anahtarı ([https://tavily.com](https://tavily.com) — ücretsiz katman mevcut)

### Adımlar

```bash
# 1. Repoyu klonla
git clone <repo-url>
cd my-ai-agent

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini ayarla
cp .env.example .env.local
# .env.local dosyasını düzenle ve TAVILY_API_KEY değerini gir

# 4. Geliştirme sunucusunu başlat
npm run dev
```

Ardından tarayıcıda [http://localhost:3000](http://localhost:3000) adresini aç.

### Ortam Değişkenleri

`.env.local` dosyası oluştur ve aşağıdaki değişkeni ekle:

```env
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx
```

> **Güvenlik notu:** Bu değişken yalnızca sunucu tarafında (`/api/search` route içinde) kullanılır. Next.js, `NEXT_PUBLIC_` öneki olmayan değişkenleri tarayıcıya asla göndermez.

---

## Kullanım

1. **Model Seç:** Sağ üstteki açılır menüden bir model seç. Küçük modeller (SmolLM2, Llama-1B) daha hızlı indirilir ve daha az bellek kullanır.
2. **Başlat:** "Başlat" düğmesine tıkla. Model tarayıcıya indirilirken indirme ilerlemesi gösterilir.
3. **Sohbet Et:** Metin kutusuna mesajını yaz ve gönder. Ajan:
   - Soruyu analiz eder, web araması gerekip gerekmediğine karar verir.
   - Gerekiyorsa Tavily üzerinden bağlam çeker.
   - Yanıtı akış olarak üretir.
4. **Durum Göstergesi:** Girdi kutusunun üzerindeki yüzen hap ("Düşünüyor…", "Arama yapıyor…", "Yanıt üretiliyor…") ajanın o anki adımını gösterir.

---

## API Route

### `POST /api/search`

Tavily Search API'ye sunucu taraflı proxy.

**İstek gövdesi:**

```json
{ "query": "aranacak metin" }
```

**Başarılı yanıt:**

```json
{ "context": "Tavily'nin özet cevabı veya sonuç listesi" }
```

**Hata yanıtı (HTTP 500):**

```json
{ "context": "" }
```

---

## Geliştirme Komutları

```bash
npm run dev      # Hot-reload ile geliştirme sunucusu (localhost:3000)
npm run build    # Üretim derlemesi
npm run start    # Üretim sunucusunu başlat
npm run lint     # ESLint kontrolü
```

---

## Tarayıcı Gereksinimleri

Bu uygulama WebGPU kullanır. Destekleyen tarayıcılar:

| Tarayıcı | Minimum Sürüm |
|----------|---------------|
| Chrome / Chromium | 113+ |
| Microsoft Edge | 113+ |
| Chrome Android | 121+ |
| Safari | 18+ (macOS/iOS) |
| Firefox | Henüz desteklenmiyor |

Tarayıcınızın WebGPU desteğini kontrol etmek için: [https://webgpureport.org](https://webgpureport.org)

---

## Güvenlik

- `TAVILY_API_KEY` yalnızca sunucu taraflı Next.js API route'unda kullanılır; tarayıcıya hiç gönderilmez.
- `.gitignore` dosyası `.env*` kalıbını dışlar; ortam değişkenleri git geçmişine işlenmez.
- Tüm LLM işlemleri tarayıcıda gerçekleşir; kullanıcı verisi dışarıya çıkmaz.

---

## Bilinen Kısıtlamalar

- **Bellek:** Büyük modeller (Phi-3, Llama-3B) sekme başına 3–4 GB GPU belleği gerektirebilir.
- **İlk Yükleme:** Model ağırlıkları ilk kez indirilirken bağlantı hızına göre uzun sürebilir.
- **Tarayıcı Uyumu:** WebGPU olmayan tarayıcılarda (Firefox, eski mobil) hiç çalışmaz.
- **Oturum Sürekliliği Yok:** Sayfa yenilendiğinde sohbet geçmişi kaybolur.
- **Tek Model:** Aynı anda yalnızca bir model yüklü olabilir; model değiştirmek için sayfanın yenilenmesi gerekir.

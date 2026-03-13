import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

export const AVAILABLE_MODELS = {
  smol: {
    id: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    name: "SmolLM2-360M (Hızlı)",
    size: "~360MB"
  },
  llama: {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    name: "Llama-3.2-1B (Akıllı)",
    size: "~1.5GB"
  },
  phi3: {
    id: "Phi-3-mini-4k-instruct-q4f32_1-MLC",
    name: "Microsoft Phi-3 (Mantık Uzmanı)",
    size: "~2.5GB"
  },
  llama3b: {
    id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    name: "Llama-3.2-3B (Çok Zeki)",
    size: "~2.5GB"
  },
  qwen: {
    id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    name: "Qwen-2.5-1.5B (Türkçe Ustası)",
    size: "~1.5GB"
  },
  qwenMax: {
    id: "Qwen2.5-3B-Instruct-q4f32_1-MLC",
    name: "Qwen-2.5-3B (Maksimum Güç)",
    size: "~2.5GB"
  }
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;

let engineInstance: MLCEngine | null = null;

// Model ağırlıklarını koruyarak sadece shader/pipeline cache'lerini temizler
async function clearShaderCache(modelId: string): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  // WebLLM model cache anahtarları model ID içerir — bunları koru, diğerlerini sil
  const shaderCacheKeys = keys.filter((k) => !k.includes(modelId));
  await Promise.all(shaderCacheKeys.map((k) => caches.delete(k)));
}

function isShaderError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("ShaderModule") || msg.includes("Invalid") || msg.includes("shader");
}

// Modeli tarayıcıya indirme ve başlatma fonksiyonu
export async function initEngine(
  modelKey: ModelKey,
  onProgress: (text: string, progress: number) => void
): Promise<MLCEngine> {
  const modelId = AVAILABLE_MODELS[modelKey].id;

  // Eğer zaten yüklüyse tekrar indirme
  if (engineInstance) return engineInstance;

  try {
    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress(report.text || "Yükleniyor...", report.progress || 0);
      },
    });
    engineInstance = engine;
    return engine;
  } catch (error) {
    if (isShaderError(error)) {
      // GPU shader cache bozuk — model ağırlıklarını koruyarak sadece shader cache'i temizle
      onProgress("GPU shader cache bozuk, temizleniyor (model yeniden indirilmeyecek)...", 0);
      await clearShaderCache(modelId);

      const engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          onProgress(report.text || "Yeniden başlatılıyor...", report.progress || 0);
        },
      });
      engineInstance = engine;
      return engine;
    }
    throw error;
  }
}
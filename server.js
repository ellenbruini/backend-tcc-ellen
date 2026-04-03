require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const app  = express();
const PORT = process.env.PORT || 3000;

// Aceita JSON com imagens em base64 (até 25 MB)
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" }));

// Serve o frontend (index.html, script.js)
app.use(express.static(__dirname));

// ── Endpoint de síntese de voz (Edge TTS neural) ─────────────────────
app.post("/tts", async (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ erro: "Campo texto é obrigatório." });

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata("pt-BR-FranciscaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    res.setHeader("Content-Type", "audio/mpeg");
    const { audioStream } = tts.toStream(texto);
    audioStream.pipe(res);
  } catch (err) {
    console.error("Erro TTS:", err);
    if (!res.headersSent) res.status(500).json({ erro: "Erro ao gerar áudio." });
  }
});

const MODELOS_VISAO = [
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "moonshotai/kimi-vl-a3b-thinking:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "qwen/qwen2.5-vl-32b-instruct:free",
];

// ── Endpoint principal ───────────────────────────────────────────────
app.post("/descrever", async (req, res) => {
  const { imagemBase64, mimeType } = req.body;

  if (!imagemBase64 || !mimeType) {
    return res.status(400).json({ erro: "Campos imagemBase64 e mimeType são obrigatórios." });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: "Chave da API não configurada no servidor." });
  }

  const prompt = `
Você é um assistente de acessibilidade para pessoas com deficiência visual.
Descreva esta imagem de forma completa e detalhada em português brasileiro.

Siga esta ordem:
1. Tipo de imagem (foto, gráfico, diagrama, captura de tela, arte, etc.)
2. Conteúdo principal (o que está em destaque ou centro)
3. Contexto e ambiente (plano de fundo, local, cenário)
4. Detalhes visuais importantes (cores, formas, posições, expressões, textos visíveis)
5. Se houver gráfico ou dado: leia os valores, eixos, legendas e tendências
6. Se houver texto na imagem: transcreva-o
7. Impressão geral ou sentimento transmitido

Seja preciso, claro e use linguagem natural. Não use markdown nem listas — escreva em parágrafos corridos.
`.trim();

  const mensagens = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imagemBase64}` } },
      ],
    },
  ];

  let ultimoErro = "Nenhum modelo disponível no momento. Tente novamente mais tarde.";

  for (const modelo of MODELOS_VISAO) {
    try {
      const apiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "X-Title": "Descritor de Imagens Acessível",
        },
        body: JSON.stringify({ model: modelo, messages: mensagens, max_tokens: 1024, temperature: 0.4 }),
      });

      if (!apiRes.ok) {
        const err = await apiRes.json().catch(() => ({}));
        ultimoErro = err?.error?.message || `Erro HTTP ${apiRes.status}`;
        console.warn(`Modelo ${modelo} falhou: ${ultimoErro}`);
        continue;
      }

      const dados = await apiRes.json();
      const texto = dados?.choices?.[0]?.message?.content;

      if (!texto) {
        ultimoErro = "A IA não retornou uma descrição.";
        console.warn(`Modelo ${modelo} não retornou texto.`);
        continue;
      }

      console.log(`Modelo usado: ${modelo}`);
      return res.json({ descricao: texto.trim() });

    } catch (err) {
      ultimoErro = "Erro interno ao chamar a API.";
      console.error(`Erro com modelo ${modelo}:`, err);
    }
  }

  res.status(502).json({ erro: ultimoErro });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

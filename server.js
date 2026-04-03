require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");

const app  = express();
const PORT = process.env.PORT || 3000;

// Aceita JSON com imagens em base64 (até 25 MB)
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" }));

// Serve o frontend (index.html, script.js)
app.use(express.static(__dirname));

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

  const corpo = {
    model: "qwen/qwen2.5-vl-72b-instruct:free",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imagemBase64}` } },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.4,
  };

  try {
    const apiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-Title": "Descritor de Imagens Acessível",
      },
      body: JSON.stringify(corpo),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      const msg = err?.error?.message || `Erro HTTP ${apiRes.status}`;
      return res.status(502).json({ erro: msg });
    }

    const dados = await apiRes.json();
    const texto = dados?.choices?.[0]?.message?.content;

    if (!texto) {
      return res.status(502).json({ erro: "A IA não retornou uma descrição. Tente novamente." });
    }

    res.json({ descricao: texto.trim() });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro interno ao chamar a API." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

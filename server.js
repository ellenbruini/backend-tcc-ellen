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

  const apiKey = process.env.GEMINI_API_KEY;
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
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imagemBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  };

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      const msg = err?.error?.message || `Erro HTTP ${geminiRes.status}`;
      return res.status(502).json({ erro: msg });
    }

    const dados = await geminiRes.json();
    const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      return res.status(502).json({ erro: "A IA não retornou uma descrição. Tente novamente." });
    }

    res.json({ descricao: texto.trim() });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro interno ao chamar a API Gemini." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

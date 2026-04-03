import os
import io
import asyncio
import requests
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import edge_tts

load_dotenv()

app = Flask(__name__)
CORS(app)

MODELOS_VISAO = [
    "google/gemma-3-27b-it:free",
    "google/gemma-3-12b-it:free",
    "moonshotai/kimi-vl-a3b-thinking:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "qwen/qwen2.5-vl-32b-instruct:free",
]

PROMPT = """
Você é um sistema de descrição de imagens para pessoas com deficiência visual em contexto acadêmico e profissional.
Sua descrição deve ser objetiva, técnica e completa, permitindo que a pessoa compreenda e utilize a imagem em seu trabalho ou estudo sem precisar vê-la.

Siga rigorosamente esta estrutura:

1. TIPO: Identifique o tipo exato (fotografia, gráfico de barras, gráfico de linha, pizza, tabela, diagrama, fluxograma, captura de tela, infográfico, mapa, etc.).

2. CONTEÚDO PRINCIPAL: Descreva o que está sendo representado, sem omitir nada relevante. Se for um gráfico ou dado numérico, leia todos os valores, rótulos, eixos, unidades de medida, legendas e tendências observadas. Se for uma tabela, leia todas as células. Se for texto, transcreva-o integralmente.

3. DETALHES VISUAIS: Descreva cores, formas, posições, proporções, escalas e qualquer elemento visual que impacte a interpretação do conteúdo.

4. PESSOAS (se houver): Descreva gênero aparente, tom de pele, expressão facial, postura, vestimenta e posição na imagem. Essas informações são relevantes para a compreensão do contexto.

5. CONTEXTO E AMBIENTE: Descreva o cenário, plano de fundo e qualquer elemento que ajude a situar o conteúdo principal.

6. INTERPRETAÇÃO TÉCNICA: Indique o que os dados ou a cena representam objetivamente — tendências, comparações, conclusões visíveis, sem especulações.

Regras obrigatórias:
- Escreva em português brasileiro, em parágrafos corridos, sem markdown, sem bullet points, sem títulos.
- Nunca omita valores numéricos, nomes, datas ou textos presentes na imagem.
- Nunca faça suposições além do que é visível.
- Seja direto e técnico, sem rodeios ou linguagem poética.
""".strip()


# Serve o frontend
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


# Endpoint de descrição de imagem
@app.route("/descrever", methods=["POST"])
def descrever():
    data = request.get_json()
    imagem_base64 = data.get("imagemBase64")
    mime_type = data.get("mimeType")

    if not imagem_base64 or not mime_type:
        return jsonify({"erro": "Campos imagemBase64 e mimeType são obrigatórios."}), 400

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return jsonify({"erro": "Chave da API não configurada no servidor."}), 500

    mensagens = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{imagem_base64}"}},
            ],
        }
    ]

    ultimo_erro = "Nenhum modelo disponível no momento. Tente novamente mais tarde."

    for modelo in MODELOS_VISAO:
        try:
            resposta = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "X-Title": "Descritor de Imagens Acessível",
                },
                json={"model": modelo, "messages": mensagens, "max_tokens": 1024, "temperature": 0.4},
                timeout=60,
            )

            if not resposta.ok:
                ultimo_erro = resposta.json().get("error", {}).get("message", f"Erro HTTP {resposta.status_code}")
                print(f"Modelo {modelo} falhou: {ultimo_erro}")
                continue

            texto = resposta.json().get("choices", [{}])[0].get("message", {}).get("content")

            if not texto:
                ultimo_erro = "A IA não retornou uma descrição."
                continue

            print(f"Modelo usado: {modelo}")
            return jsonify({"descricao": texto.strip()})

        except Exception as e:
            ultimo_erro = str(e)
            print(f"Erro com modelo {modelo}: {e}")

    return jsonify({"erro": ultimo_erro}), 502


# Endpoint de síntese de voz
@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json()
    texto = data.get("texto", "")

    if not texto:
        return jsonify({"erro": "Campo texto é obrigatório."}), 400

    async def gerar_audio():
        communicate = edge_tts.Communicate(texto, "pt-BR-FranciscaNeural")
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        buffer.seek(0)
        return buffer

    try:
        buffer = asyncio.run(gerar_audio())
        return send_file(buffer, mimetype="audio/mpeg")
    except Exception as e:
        print(f"Erro TTS: {e}")
        return jsonify({"erro": "Erro ao gerar áudio."}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port)

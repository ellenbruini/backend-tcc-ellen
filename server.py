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
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "qwen/qwen2.5-vl-32b-instruct:free",
]

PROMPT = """
Você descreve imagens para uma pessoa que não pode vê-las, em contexto profissional ou acadêmico.
Seja objetivo e natural, como um colega descrevendo algo em voz alta.

Leia a imagem na ordem ocidental: de cima para baixo, da esquerda para a direita.

Se for um gráfico ou dado visual: comece pelo título, se houver. Identifique o tipo de gráfico. Descreva o eixo X: o que representa e quais são suas categorias ou valores. Descreva o eixo Y: o que representa, a unidade e a escala. Leia cada série de dados em ordem com seus valores exatos. Aponte o valor mais alto, o mais baixo e a tendência geral. Mencione legenda, fonte e notas, se houver.

Se for uma fotografia ou ilustração: descreva o que está em destaque no plano principal. Descreva pessoas presentes informando gênero aparente, tom de pele, expressão facial, postura, vestimenta e posição na cena. Descreva o ambiente e o plano de fundo. Leia qualquer texto visível na imagem.

Se for uma tabela: descreva o que cada coluna representa e leia cada linha com todos os seus valores.

Regras obrigatórias: escreva em português brasileiro em parágrafos corridos, sem listas, sem títulos, sem markdown. Use linguagem direta e executiva. Nunca omita números, datas, nomes ou unidades de medida. Nunca especule além do que é visível na imagem.
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

// ────────────────────────────────────────────────
//  Descritor de Imagens Acessível
//  Backend: Node.js/Express (chama Google Gemini)
//  Voz: Web Speech API nativa do navegador
// ────────────────────────────────────────────────

// Aponta para o próprio servidor — funciona tanto local quanto em produção
const API_URL = "/descrever";

// ── Elementos da interface ──────────────────────
const inputArquivo  = document.getElementById("file-input");
const dropZone      = document.getElementById("drop-zone");
const preview       = document.getElementById("preview");
const nomeArquivo   = document.getElementById("nome-arquivo");
const btnAnalisar   = document.getElementById("btn-analisar");
const statusEl      = document.getElementById("status");
const cardResultado = document.getElementById("card-resultado");
const respostaEl    = document.getElementById("resposta");
const btnFalar      = document.getElementById("btn-falar");
const btnParar      = document.getElementById("btn-parar");
const btnCopiar     = document.getElementById("btn-copiar");
const sliderVel     = document.getElementById("velocidade");
const valVel        = document.getElementById("val-velocidade");

let imagemBase64 = null;
let imagemMime   = null;
let instrucoesFaladas = false;

const INSTRUCOES = `
Bem-vindo ao Descritor de Imagens Acessível.
Este aplicativo recebe uma imagem e lê em voz alta uma descrição detalhada do que ela contém. Ele foi criado para pessoas que não enxergam.

Para navegar entre os elementos da página, use a tecla Tab para avançar e Shift mais Tab para voltar. Para ativar um botão, pressione Enter ou Espaço.

O uso segue três passos simples.

Passo um: escolher a imagem. Pressione Tab até ouvir "Clique ou pressione Enter para selecionar uma imagem". Pressione Enter. Uma janela do seu computador vai abrir para você escolher o arquivo. Navegue até a imagem e confirme. O nome do arquivo será anunciado quando a seleção for concluída.

Passo dois: analisar. Após escolher a imagem, pressione Tab até ouvir "Analisar Imagem" e pressione Enter. Aguarde alguns segundos enquanto a inteligência artificial processa a imagem.

Passo três: ouvir a descrição. Assim que a análise terminar, a descrição será lida automaticamente. Você não precisa fazer nada.

Após a leitura, você terá três opções. O botão Ouvir repete a descrição. O botão Parar interrompe a leitura. O botão Copiar copia o texto para a área de transferência. Há também um controle deslizante para ajustar a velocidade da fala.

Para ouvir estas instruções novamente a qualquer momento, pressione Tab até o botão Ouvir Instruções de Uso e pressione Enter.

Agora, pressione Tab para ir ao campo de seleção de imagem e começar.
`.trim();

function falarInstrucoes() {
  if (instrucoesFaladas) return;
  instrucoesFaladas = true;
  falar(INSTRUCOES);
}

// Tenta falar na primeira interação do usuário com a página
document.addEventListener("click",   falarInstrucoes, { once: true });
document.addEventListener("keydown",  falarInstrucoes, { once: true });
document.addEventListener("touchstart", falarInstrucoes, { once: true });

// ── Upload: clique e drag-and-drop ──────────────

dropZone.addEventListener("click", () => inputArquivo.click());

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    inputArquivo.click();
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#a78bfa";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "";
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "";
  const arquivo = e.dataTransfer.files[0];
  if (arquivo) processarArquivo(arquivo);
});

inputArquivo.addEventListener("change", () => {
  if (inputArquivo.files[0]) processarArquivo(inputArquivo.files[0]);
});

function processarArquivo(arquivo) {
  if (!arquivo.type.startsWith("image/")) {
    mostrarStatus("Por favor, selecione um arquivo de imagem.", "err");
    return;
  }

  if (arquivo.size > 20 * 1024 * 1024) {
    mostrarStatus("Arquivo muito grande. O limite é 20 MB.", "err");
    return;
  }

  imagemMime = arquivo.type;
  nomeArquivo.textContent = `Arquivo: ${arquivo.name}`;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    imagemBase64 = dataUrl.split(",")[1];

    preview.src = dataUrl;
    preview.style.display = "block";
    btnAnalisar.disabled = false;
    mostrarStatus("");

    cardResultado.style.display = "none";
    respostaEl.style.display = "none";
  };
  reader.readAsDataURL(arquivo);
}

// ── Velocidade de leitura ───────────────────────

sliderVel.addEventListener("input", () => {
  valVel.textContent = `${sliderVel.value}×`;
});

// ── Botão Analisar ──────────────────────────────

btnAnalisar.addEventListener("click", analisar);

async function analisar() {
  if (!imagemBase64) {
    mostrarStatus("Selecione uma imagem primeiro.", "err");
    return;
  }

  btnAnalisar.disabled = true;
  btnAnalisar.textContent = "Analisando…";
  mostrarStatus("Enviando imagem para a IA…");
  pararFala();

  try {
    const resposta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagemBase64, mimeType: imagemMime }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || `Erro ${resposta.status}`);
    }

    exibirDescricao(dados.descricao);
    mostrarStatus("Descrição gerada com sucesso!", "ok");
    falar(dados.descricao);

  } catch (err) {
    mostrarStatus(`Erro: ${err.message}`, "err");
    console.error(err);
  } finally {
    btnAnalisar.disabled = false;
    btnAnalisar.textContent = "Analisar Imagem";
  }
}

// ── Exibir descrição ────────────────────────────

function exibirDescricao(texto) {
  respostaEl.textContent = texto;
  respostaEl.style.display = "block";
  cardResultado.style.display = "block";
  respostaEl.focus();
}

// ── Síntese de voz (Edge TTS neural via backend) ────────────────────

let audioAtual = null;

async function falar(texto) {
  pararFala();

  btnFalar.style.display = "none";
  btnParar.style.display = "inline-flex";

  try {
    const resposta = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });

    if (!resposta.ok) throw new Error("Erro ao gerar áudio");

    const blob = await resposta.blob();
    const url  = URL.createObjectURL(blob);

    audioAtual = new Audio(url);
    audioAtual.playbackRate = parseFloat(sliderVel.value);

    audioAtual.onended = () => {
      URL.revokeObjectURL(url);
      audioAtual = null;
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
    };

    audioAtual.onerror = () => {
      audioAtual = null;
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
    };

    audioAtual.play();

  } catch (err) {
    console.error("Erro TTS:", err);
    btnFalar.style.display = "inline-flex";
    btnParar.style.display = "none";
  }
}

function pararFala() {
  if (audioAtual) {
    audioAtual.pause();
    audioAtual = null;
  }
  btnFalar.style.display = "inline-flex";
  btnParar.style.display = "none";
}

btnFalar.addEventListener("click", () => {
  const texto = respostaEl.textContent;
  if (texto) falar(texto);
});

btnParar.addEventListener("click", pararFala);

// ── Copiar texto ────────────────────────────────

btnCopiar.addEventListener("click", async () => {
  const texto = respostaEl.textContent;
  if (!texto) return;

  try {
    await navigator.clipboard.writeText(texto);
    btnCopiar.textContent = "✅ Copiado!";
    setTimeout(() => (btnCopiar.textContent = "📋 Copiar"), 2000);
  } catch {
    mostrarStatus("Não foi possível copiar automaticamente.", "err");
  }
});

// ── Helpers ─────────────────────────────────────

function mostrarStatus(msg, tipo = "") {
  statusEl.textContent = msg;
  statusEl.className = tipo;
}

const btnInstrucoes = document.getElementById("btn-instrucoes");
btnInstrucoes.addEventListener("click", () => {
  instrucoesFaladas = false; // permite repetir ao clicar no botão
  falarInstrucoes();
});

// Foca no botão de instruções ao carregar para facilitar acesso via teclado
window.addEventListener("load", () => {
  btnInstrucoes.focus();
});

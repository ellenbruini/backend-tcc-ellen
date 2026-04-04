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
Bem-vindo. Use Tab para navegar e Enter para confirmar.
Passo 1: pressione Tab até ouvir "selecionar imagem" e pressione Enter para escolher o arquivo.
Passo 2: pressione Tab até ouvir "Analisar Imagem" e pressione Enter.
Passo 3: aguarde. A descrição será lida automaticamente assim que estiver pronta.
`.trim();

function falarInstrucoes() {
  if (instrucoesFaladas) return;
  instrucoesFaladas = true;
  falar(INSTRUCOES);
}

// Instruções só tocam pelo botão explícito — sem auto-disparo em qualquer clique

// ── Upload: clique e drag-and-drop ──────────────

dropZone.addEventListener("click", () => { pararFala(); inputArquivo.click(); });

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pararFala();
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
    btnAnalisar.setAttribute("aria-disabled", "false");
    mostrarStatus("");
    setTimeout(() => {
      btnAnalisar.focus();
      anunciar(`Imagem selecionada: ${arquivo.name}. Pressione Enter para analisar.`);
    }, 300);

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

btnAnalisar.addEventListener("click", () => { pararFala(); analisar(); });

async function analisar() {
  if (btnAnalisar.getAttribute("aria-disabled") === "true") return;
  if (!imagemBase64) {
    mostrarStatus("Selecione uma imagem primeiro.", "err");
    return;
  }

  btnAnalisar.setAttribute("aria-disabled", "true");
  btnAnalisar.textContent = "Analisando…";
  mostrarStatus("Enviando imagem para a IA…");
  pararFala();
  anunciar("Descrição está sendo gerada, aguarde alguns instantes!");

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
    falar(dados.descricao, true); // forcarReinicio garante que sempre toca

  } catch (err) {
    mostrarStatus(`Erro: ${err.message}`, "err");
    console.error(err);
  } finally {
    btnAnalisar.setAttribute("aria-disabled", "false");
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

let audioAtual      = null;
let fetchController = null;

async function falar(texto, forcarReinicio = false) {
  if ((audioAtual || fetchController) && !forcarReinicio) return;

  if (fetchController) fetchController.abort();
  pararFala();

  fetchController = new AbortController();

  btnFalar.style.display = "none";
  btnParar.style.display = "inline-flex";
  btnParar.textContent   = "⏳ Aguarde…";
  btnParar.disabled      = true;

  try {
    const resposta = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
      signal: fetchController.signal,
    });

    if (!resposta.ok) throw new Error("Erro ao gerar áudio");

    const blob = await resposta.blob();
    const url  = URL.createObjectURL(blob);

    audioAtual = new Audio(url);
    audioAtual.playbackRate = parseFloat(sliderVel.value);

    btnParar.textContent = "⏹ Parar";
    btnParar.disabled    = false;

    audioAtual.onended = () => {
      URL.revokeObjectURL(url);
      audioAtual = null;
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
      btnParar.textContent   = "⏹ Parar";
      btnParar.disabled      = false;
    };

    audioAtual.onerror = () => {
      audioAtual = null;
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
    };

    audioAtual.play();

  } catch (err) {
    if (err.name === "AbortError") return; // cancelado intencionalmente, sem erro
    console.error("Erro TTS:", err);
    btnFalar.style.display = "inline-flex";
    btnParar.style.display = "none";
  } finally {
    fetchController = null;
  }
}

function pararFala() {
  if (fetchController) { fetchController.abort(); fetchController = null; }
  if (audioAtual) { audioAtual.pause(); audioAtual = null; }
  window.speechSynthesis?.cancel();
  btnFalar.style.display = "inline-flex";
  btnParar.style.display = "none";
  btnParar.textContent   = "⏹ Parar";
  btnParar.disabled      = false;
}

// ── Anúncios de navegação (Web Speech API — instantâneo) ─────────────

let timerAnuncio = null;

function anunciar(texto) {
  if (!window.speechSynthesis) return;
  clearTimeout(timerAnuncio);
  timerAnuncio = setTimeout(() => {
    // Para tudo definitivamente ao navegar — fetch em andamento e áudio
    if (fetchController) { fetchController.abort(); fetchController = null; }
    if (audioAtual) { audioAtual.pause(); audioAtual = null; }
    btnFalar.style.display = "inline-flex";
    btnParar.style.display = "none";
    btnParar.textContent = "⏹ Parar";
    btnParar.disabled    = false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang  = "pt-BR";
    u.rate  = 1.05;
    window.speechSynthesis.speak(u);
  }, 150);
}

// Foco em cada elemento interativo
document.getElementById("btn-instrucoes").addEventListener("focus", () =>
  anunciar("Botão: Ouvir Instruções de Uso. Pressione Enter para ouvir.")
);

dropZone.addEventListener("focus", () =>
  anunciar("Área de seleção de imagem. Pressione Enter para escolher um arquivo do seu computador.")
);

btnAnalisar.addEventListener("focus", () => {
  if (btnAnalisar.disabled) {
    anunciar("Botão Analisar Imagem desativado. Selecione uma imagem primeiro.");
  } else {
    anunciar("Botão: Analisar Imagem. Pressione Enter para analisar.");
  }
});

sliderVel.addEventListener("focus", () =>
  anunciar(`Controle de velocidade da fala. Valor atual: ${sliderVel.value} vezes. Use as setas para ajustar.`)
);

btnFalar.addEventListener("focus", () =>
  anunciar("Botão: Ouvir descrição novamente. Pressione Enter.")
);

btnParar.addEventListener("focus", () =>
  anunciar("Botão: Parar leitura. Pressione Enter.")
);

btnCopiar.addEventListener("focus", () =>
  anunciar("Botão: Copiar texto da descrição. Pressione Enter.")
);

btnFalar.addEventListener("click", () => {
  const texto = respostaEl.textContent;
  if (texto) falar(texto, true); // reinício explícito pelo usuário
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

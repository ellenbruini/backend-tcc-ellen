const API_URL = "/descrever";

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
let instrucoesFaladas  = false;
let suprimirFocoZona   = false; // evita que o foco no dropZone cancele a fala do nome

// ── Bem-vindo automático ────────────────────────

const INSTRUCOES = `
Bem-vindo ao Descritor de Imagens Acessível. Use um computador para melhor navegação. Pressione Enter para carregar uma imagem. Se necessário, use Tab para navegar até o botão.
`.trim();

function falarInstrucoes() {
  if (instrucoesFaladas) return;
  instrucoesFaladas = true;
  falarWebSpeech(INSTRUCOES, () => dropZone.focus());
}

window.addEventListener("load", () => setTimeout(falarInstrucoes, 600));

// ── Upload ──────────────────────────────────────

dropZone.addEventListener("click", () => {
  suprimirFocoZona = true;
  pararFala();
  inputArquivo.click();
});

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    suprimirFocoZona = true;
    pararFala();
    inputArquivo.click();
  }
});

dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.style.borderColor = "#a78bfa"; });
dropZone.addEventListener("dragleave", ()  => { dropZone.style.borderColor = ""; });
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "";
  if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]);
});

inputArquivo.addEventListener("change", () => {
  if (inputArquivo.files[0]) processarArquivo(inputArquivo.files[0]);
});

function processarArquivo(arquivo) {
  if (!arquivo.type.startsWith("image/")) {
    falarWebSpeech("Por favor, selecione um arquivo de imagem.");
    return;
  }
  if (arquivo.size > 20 * 1024 * 1024) {
    falarWebSpeech("Arquivo muito grande. O limite é vinte megabytes.");
    return;
  }

  imagemMime = arquivo.type;
  nomeArquivo.textContent = `Arquivo: ${arquivo.name}`;

  const reader = new FileReader();
  reader.onload = (ev) => {
    imagemBase64 = ev.target.result.split(",")[1];
    preview.src  = ev.target.result;
    preview.style.display = "block";
    btnAnalisar.setAttribute("aria-disabled", "false");
    mostrarStatus("");
    cardResultado.style.display = "none";
    respostaEl.style.display    = "none";

    // Fala o nome e ao terminar inicia a análise
    // suprimirFocoZona evita que o listener do dropZone cancele esta fala
    falarWebSpeech(`Arquivo selecionado: ${arquivo.name}.`, () => {
      suprimirFocoZona = false;
      analisar();
    });
  };
  reader.readAsDataURL(arquivo);
}

// ── Velocidade ──────────────────────────────────

sliderVel.addEventListener("input", () => {
  valVel.textContent = `${sliderVel.value}×`;
});

// ── Analisar ────────────────────────────────────

btnAnalisar.addEventListener("click", () => { pararFala(); analisar(); });

async function analisar() {
  if (btnAnalisar.getAttribute("aria-disabled") === "true") return;
  if (!imagemBase64) { falarWebSpeech("Selecione uma imagem primeiro."); return; }

  btnAnalisar.setAttribute("aria-disabled", "true");
  btnAnalisar.textContent = "Analisando…";
  mostrarStatus("Analisando…");
  falarWebSpeech("Descrição sendo gerada, aguarde.");

  try {
    const resp  = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagemBase64, mimeType: imagemMime }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

    exibirDescricao(dados.descricao);
    mostrarStatus("Descrição gerada!", "ok");
    falar(dados.descricao, true);

  } catch (err) {
    mostrarStatus(`Erro: ${err.message}`, "err");
    falarWebSpeech(`Erro: ${err.message}`);
  } finally {
    btnAnalisar.setAttribute("aria-disabled", "false");
    btnAnalisar.textContent = "Analisar Imagem";
  }
}

function exibirDescricao(texto) {
  respostaEl.textContent = texto;
  respostaEl.style.display = "block";
  cardResultado.style.display = "block";
}

// ── TTS principal — Edge TTS via backend ────────

let fetchController = null;
const audioEl = new Audio();

document.addEventListener("click", () => {
  audioEl.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  audioEl.play().catch(() => {});
}, { once: true });

async function falar(texto, forcarReinicio = false) {
  if (!forcarReinicio && !audioEl.paused && !audioEl.ended) return;
  if (fetchController) fetchController.abort();
  audioEl.pause();
  window.speechSynthesis?.cancel();

  fetchController = new AbortController();
  btnFalar.style.display = "none";
  btnParar.style.display = "inline-flex";
  btnParar.textContent   = "⏳ Aguarde…";
  btnParar.disabled      = true;

  try {
    const resp = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
      signal: fetchController.signal,
    });
    if (!resp.ok) throw new Error("Erro ao gerar áudio");

    const url = URL.createObjectURL(await resp.blob());
    audioEl.src          = url;
    audioEl.playbackRate = parseFloat(sliderVel.value);
    btnParar.textContent = "⏹ Parar";
    btnParar.disabled    = false;

    audioEl.onended = () => {
      URL.revokeObjectURL(url);
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
    };
    audioEl.onerror = () => {
      btnFalar.style.display = "inline-flex";
      btnParar.style.display = "none";
    };

    await audioEl.play();
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("Erro TTS:", err);
    btnFalar.style.display = "inline-flex";
    btnParar.style.display = "none";
  } finally {
    fetchController = null;
  }
}

function pararFala() {
  if (fetchController) { fetchController.abort(); fetchController = null; }
  audioEl.pause();
  window.speechSynthesis?.cancel();
  btnFalar.style.display = "inline-flex";
  btnParar.style.display = "none";
  btnParar.textContent   = "⏹ Parar";
  btnParar.disabled      = false;
}

// ── Web Speech API — anúncios instantâneos ──────

function falarWebSpeech(texto, aoTerminar) {
  if (!window.speechSynthesis) { if (aoTerminar) aoTerminar(); return; }
  window.speechSynthesis.cancel();
  const u  = new SpeechSynthesisUtterance(texto);
  u.lang   = "pt-BR";
  u.rate   = 1.0;
  if (aoTerminar) u.onend = aoTerminar;
  window.speechSynthesis.speak(u);
}

// ── Anúncios de foco (navegação por Tab) ────────

dropZone.addEventListener("focus", () => {
  if (suprimirFocoZona) return;
  falarWebSpeech("Carregar imagem. Pressione Enter para escolher o arquivo e a descrição começa automaticamente.");
});

btnAnalisar.addEventListener("focus", () => {
  const desativado = btnAnalisar.getAttribute("aria-disabled") === "true";
  falarWebSpeech(desativado
    ? "Botão Analisar desativado. Selecione uma imagem primeiro."
    : "Botão Analisar Imagem. Pressione Enter.");
});

sliderVel.addEventListener("focus", () =>
  falarWebSpeech(`Velocidade: ${sliderVel.value} vezes. Use as setas para ajustar.`)
);
btnFalar.addEventListener("focus",  () => falarWebSpeech("Ouvir descrição. Pressione Enter."));
btnParar.addEventListener("focus",  () => falarWebSpeech("Parar leitura. Pressione Enter."));
btnCopiar.addEventListener("focus", () => falarWebSpeech("Copiar texto. Pressione Enter."));

// ── Botões de controle de áudio ─────────────────

btnFalar.addEventListener("click", () => {
  const texto = respostaEl.textContent;
  if (texto) falar(texto, true);
});
btnParar.addEventListener("click", pararFala);

// ── Copiar ──────────────────────────────────────

btnCopiar.addEventListener("click", async () => {
  const texto = respostaEl.textContent;
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    btnCopiar.textContent = "✅ Copiado!";
    setTimeout(() => (btnCopiar.textContent = "📋 Copiar"), 2000);
  } catch {
    mostrarStatus("Não foi possível copiar.", "err");
  }
});

// ── Helpers ─────────────────────────────────────

function mostrarStatus(msg, tipo = "") {
  statusEl.textContent = msg;
  statusEl.className   = tipo;
}


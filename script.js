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
Este site descreve imagens em voz alta para pessoas com deficiência visual.
Veja como usar:
Passo 1: clique na área de upload ou pressione Enter para selecionar uma imagem do seu computador.
Passo 2: após escolher a imagem, pressione o botão Analisar Imagem.
Passo 3: aguarde alguns segundos. A descrição será lida automaticamente.
Para ouvir a descrição novamente, pressione o botão Ouvir. Para parar, pressione o botão Parar.
Agora, clique na área de upload para começar.
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

// ── Síntese de voz ──────────────────────────────

// Armazena vozes assim que carregam (Chrome carrega async)
let vozesDisponiveis = [];

function atualizarVozes() {
  vozesDisponiveis = window.speechSynthesis.getVoices();
}

if (window.speechSynthesis) {
  atualizarVozes();
  window.speechSynthesis.onvoiceschanged = atualizarVozes;
}

function escolherMelhorVoz() {
  // 1ª prioridade: voz neural Google pt-BR (Chrome — soa muito natural)
  const google = vozesDisponiveis.find((v) =>
    v.lang === "pt-BR" && v.name.toLowerCase().includes("google")
  );
  if (google) return google;

  // 2ª prioridade: voz Microsoft pt-BR (Edge/Windows)
  const microsoft = vozesDisponiveis.find((v) =>
    v.lang === "pt-BR" && v.name.toLowerCase().includes("microsoft")
  );
  if (microsoft) return microsoft;

  // 3ª prioridade: qualquer pt-BR
  const ptBr = vozesDisponiveis.find((v) => v.lang === "pt-BR");
  if (ptBr) return ptBr;

  // 4ª prioridade: qualquer português
  return vozesDisponiveis.find((v) => v.lang.startsWith("pt")) || null;
}

function falar(texto) {
  if (!("speechSynthesis" in window)) {
    mostrarStatus("Seu navegador não suporta síntese de voz.", "err");
    return;
  }

  pararFala();

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang  = "pt-BR";
  utterance.rate  = parseFloat(sliderVel.value);
  utterance.pitch = 1.0;
  utterance.volume = 1;

  const voz = escolherMelhorVoz();
  if (voz) {
    utterance.voice = voz;
    console.log("Voz selecionada:", voz.name, voz.lang);
  } else {
    console.warn("Nenhuma voz pt-BR encontrada. Vozes disponíveis:", vozesDisponiveis.map(v => v.name));
  }

  utterance.onstart = () => {
    btnFalar.style.display = "none";
    btnParar.style.display = "inline-flex";
  };

  utterance.onend = utterance.onerror = () => {
    btnFalar.style.display = "inline-flex";
    btnParar.style.display = "none";
  };

  window.speechSynthesis.speak(utterance);
}

function pararFala() {
  window.speechSynthesis.cancel();
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

// Motor de cálculo — CJ Mapeando Futuros, Especificação 1.0
// Funções puras, sem dependências. Usadas no servidor (geração do Mapa) e nos testes.

export const VERSAO_ANALISE = "1.0";

// Tabela de letras (seção "Regras de cálculo")
const TABELA = {
  A: 1, J: 1, S: 1,
  B: 2, K: 2, T: 2,
  C: 3, L: 3, U: 3,
  D: 4, M: 4, V: 4,
  E: 5, N: 5, W: 5,
  F: 6, O: 6, X: 6,
  G: 7, P: 7, Y: 7,
  H: 8, Q: 8, Z: 8,
  I: 9, R: 9
};
const VOGAIS = new Set(["A", "E", "I", "O", "U"]); // Y é consoante (convenção proposta)
const MESTRES = new Set([11, 22, 33, 44]);

// Variações cadastradas (chaves pelo total bruto)
export const VARIACOES_NOME = [13, 19, 28, 31, 37, 46];
export const VARIACOES_DATA = [19, 20, 25, 27, 29, 30, 32, 34, 37, 43];

const PLANO_POR_VALOR = { 1: "mental", 8: "mental", 4: "fisico", 5: "fisico", 2: "emocional", 3: "emocional", 6: "emocional", 7: "intuitivo", 9: "intuitivo" };

export const somaDigitos = n => String(Math.abs(n)).split("").reduce((s, d) => s + Number(d), 0);

/** Reduz a um dígito; com `mestres`, para também em 11, 22, 33 e 44. Devolve a cadeia completa. */
export function reduzir(n, { mestres = false } = {}) {
  const cadeia = [n];
  while (n > 9 && !(mestres && MESTRES.has(n))) { n = somaDigitos(n); cadeia.push(n); }
  return { valor: n, cadeia };
}

/** Normaliza o nome para cálculo: maiúsculas, sem diacríticos, apenas A–Z por parte. */
export function normalizarNome(nome) {
  const base = String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const partes = base.split(/\s+/).map(p => p.replace(/[-'’‘`´]/g, "")).filter(Boolean);
  const invalidas = partes.join("").replace(/[A-Z]/g, "");
  return { partes, invalidas: [...new Set(invalidas)].join("") };
}

/** Valida o nome de registro. Devolve null se ok ou a mensagem de erro. */
export function validarNome(nome) {
  const limpo = String(nome || "").trim().replace(/\s+/g, " ");
  if (!limpo) return "Informe o nome completo de registro.";
  const { partes, invalidas } = normalizarNome(limpo);
  if (invalidas) return `Use apenas letras no nome (encontramos: ${invalidas}).`;
  if (partes.length < 2) return "Informe o nome completo, com sobrenome, como consta no registro de nascimento.";
  return null;
}

/** Interpreta DD/MM/AAAA. Recusa datas inexistentes e futuras (referência: hoje em São Paulo). */
export function parseData(str, hoje = hojeSaoPaulo()) {
  const m = String(str || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { erro: "Use o formato DD/MM/AAAA." };
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return { erro: "Esta data não existe no calendário." };
  if (ano < 1900) return { erro: "Confira o ano de nascimento." };
  const chave = ano * 10000 + mes * 100 + dia, chaveHoje = hoje.ano * 10000 + hoje.mes * 100 + hoje.dia;
  if (chave > chaveHoje) return { erro: "A data de nascimento não pode estar no futuro." };
  return { dia, mes, ano, texto: `${m[1]}/${m[2]}/${m[3]}` };
}

/** Data local de São Paulo (a virada do Ano Pessoal é em 01/01, horário de Brasília). */
export function hojeSaoPaulo(agora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(agora).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)]));
  return { dia: p.day, mes: p.month, ano: p.year };
}

export function idadeEm(nasc, hoje = hojeSaoPaulo()) {
  let idade = hoje.ano - nasc.ano;
  if (hoje.mes < nasc.mes || (hoje.mes === nasc.mes && hoje.dia < nasc.dia)) idade--;
  return idade;
}

// ---------- Nome ----------
export function calcularNome(nome) {
  const { partes } = normalizarNome(nome);
  const letras = partes.join("").split("");
  const porParte = partes.map(p => {
    const bruto = p.split("").reduce((s, l) => s + TABELA[l], 0);
    return { parte: p, bruto, reduzido: reduzir(bruto, { mestres: true }).valor };
  });
  const bruto = porParte.reduce((s, p) => s + p.bruto, 0);
  const red = reduzir(bruto, { mestres: true });

  let vog = 0, con = 0, nVog = 0, nCon = 0;
  const planos = { mental: 0, fisico: 0, emocional: 0, intuitivo: 0 };
  for (const l of letras) {
    const v = TABELA[l];
    if (VOGAIS.has(l)) { vog += v; nVog++; } else { con += v; nCon++; }
    planos[PLANO_POR_VALOR[v]]++;
  }
  const total = letras.length;
  const planosPct = Object.fromEntries(Object.entries(planos).map(([k, q]) => [k, {
    quantidade: q, fracao: total ? q / total : 0, percentual: total ? Math.round((q / total) * 100) : 0
  }]));

  return {
    partes: porParte,
    bruto,
    cadeia: red.cadeia,
    perfil: red.valor, // 1–9, 11, 22, 33 ou 44
    variacao: VARIACOES_NOME.includes(bruto) ? bruto : null,
    vogais: nVog ? { bruto: vog, valor: reduzir(vog).valor, cadeia: reduzir(vog).cadeia } : { ausente: true },
    consoantes: nCon ? { bruto: con, valor: reduzir(con).valor, cadeia: reduzir(con).cadeia } : { ausente: true },
    planos: planosPct,
    totalLetras: total
  };
}

// ---------- Data ----------
export function calcularData({ dia, mes, ano }) {
  const digitos = `${String(dia).padStart(2, "0")}${String(mes).padStart(2, "0")}${ano}`;
  const bruto = digitos.split("").reduce((s, d) => s + Number(d), 0);
  const red = reduzir(bruto);
  const SM = reduzir(mes).valor, SD = reduzir(dia).valor, SA = reduzir(somaDigitos(ano)).valor;
  const D1 = Math.abs(SM - SD), D2 = Math.abs(SD - SA), D3 = Math.abs(D1 - D2), D4 = Math.abs(SM - SA);

  // Ordem D3, D1, D2, D4. Cada resultado uma única vez. Zero só vale como principal (D3).
  const aspectos = [];
  [["D3", D3], ["D1", D1], ["D2", D2], ["D4", D4]].forEach(([pos, v]) => {
    if (v === 0 && pos !== "D3") return;
    if (aspectos.some(a => a.valor === v)) return;
    aspectos.push({ posicao: pos, valor: v, principal: pos === "D3" });
  });

  return {
    bruto, cadeia: red.cadeia, perfil: red.valor,
    variacao: VARIACOES_DATA.includes(bruto) ? bruto : null,
    SM, SD, SA, D1, D2, D3, D4,
    aspectos
  };
}

// ---------- Ano Pessoal ----------
export function anoPessoal({ dia, mes }, anoRef) {
  const digitos = `${String(dia).padStart(2, "0")}${String(mes).padStart(2, "0")}${anoRef}`;
  const bruto = digitos.split("").reduce((s, d) => s + Number(d), 0);
  return { ano: anoRef, bruto, valor: reduzir(bruto).valor };
}

/**
 * Decide a orientação do momento conforme a data de geração (São Paulo).
 * Novembro e dezembro: retrospectiva do ano que termina + prioridade do ano que chega.
 * Janeiro: retrospectiva do ano anterior apenas até `retroJaneiroAteDia` (a confirmar com Celso; 0 = sem retrospectiva).
 */
export function orientacaoMomento(nasc, hoje = hojeSaoPaulo(), { retroJaneiroAteDia = 0 } = {}) {
  if (hoje.mes >= 11) {
    return { tipo: "passagem", retro: anoPessoal(nasc, hoje.ano), prioridade: anoPessoal(nasc, hoje.ano + 1) };
  }
  if (hoje.mes === 1 && hoje.dia <= retroJaneiroAteDia) {
    return { tipo: "passagem", retro: anoPessoal(nasc, hoje.ano - 1), prioridade: anoPessoal(nasc, hoje.ano) };
  }
  return { tipo: "momento", prioridade: anoPessoal(nasc, hoje.ano) };
}

/** Cálculo completo, com todos os valores para conferência técnica (nunca exibidos ao cliente). */
export function calcularTudo({ nome, dataNascimento, hoje = hojeSaoPaulo(), retroJaneiroAteDia = 0 }) {
  const erroNome = validarNome(nome);
  if (erroNome) throw new Error(erroNome);
  const nasc = parseData(dataNascimento, hoje);
  if (nasc.erro) throw new Error(nasc.erro);
  const n = calcularNome(nome);
  const d = calcularData(nasc);
  const alertas = [];
  if (n.vogais.ausente) alertas.push("Nome sem vogais: revisar a seção 'O que lhe dá satisfação'.");
  if (n.consoantes.ausente) alertas.push("Nome sem consoantes: revisar a seção 'A impressão que você pode transmitir'.");
  return {
    versao: VERSAO_ANALISE,
    geradoEm: hoje,
    nascimento: nasc,
    nome: n,
    data: d,
    coincidencia: n.perfil === d.perfil,
    momento: orientacaoMomento(nasc, hoje, { retroJaneiroAteDia }),
    alertas
  };
}

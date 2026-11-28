// Seleção de textos e montagem da Análise Integrada (estrutura do PDF).
// Saída: { calc, doc, revisao }. `doc` é uma lista de seções com blocos tipados que o lib/pdf.mjs desenha.
import { calcularTudo, VERSAO_ANALISE } from "./calc.mjs";
import * as T from "./textos.mjs";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Mantém o nome como confirmado; só ajusta caixa quando veio todo em maiúsculas ou minúsculas. */
export function nomeParaExibicao(nome) {
  const limpo = String(nome).trim().replace(/\s+/g, " ");
  if (limpo !== limpo.toUpperCase() && limpo !== limpo.toLowerCase()) return limpo;
  return limpo.toLowerCase().split(" ").map((w, i) => (i > 0 && PARTICULAS.has(w)) ? w : w.split("-").map(cap).join("-")).join(" ");
}
export const dataPorExtenso = ({ dia, mes, ano }) => `${dia} de ${MESES[mes - 1]} de ${ano}`;

function nivelPlano(pct) { return pct >= 29 ? "alto" : pct <= 21 ? "baixo" : "medio"; }

export function montarAnalise({ nome, dataNascimento, foco, relato = "", hoje, retroJaneiroAteDia = 0 }) {
  if (!["vocacional", "retomada"].includes(foco)) throw new Error("Foco inválido");
  const calc = calcularTudo({ nome, dataNascimento, hoje, retroJaneiroAteDia });
  const exib = nomeParaExibicao(nome);
  const primeiro = exib.split(" ")[0];
  const P = calc.nome.perfil, D = calc.data.perfil;
  const aspectos = calc.data.aspectos;
  const A0 = aspectos[0].valor;
  const fp = T.FRAG_POTENCIAL[P], fd = T.FRAG_CAPACIDADE[D], fa = T.FRAG_ASPECTO[A0];
  const pot = T.POTENCIAIS[P], capd = T.CAPACIDADES[D];
  const usados = []; // registro de origem de cada texto para a ficha de revisão
  const marca = (grupo, chave, origem) => usados.push({ grupo, chave, origem });

  const doc = [];
  const secao = (id, titulo, blocos, opts = {}) => doc.push({ id, titulo, blocos, ...opts });

  // 1. Capa + Apresentação + Seus potenciais naturais + Como usar seu Mapa
  secao("abertura", null, [
    { t: "capa", titulo: "Mapa de Potenciais e Caminhos", subtitulo: "Análise Integrada", nome: exib, data: dataPorExtenso(calc.nascimento) },
    { t: "h2", texto: "Apresentação", id: "apresentacao" },
    { t: "p", texto: `${primeiro}, ${T.APRESENTACAO[foco]}`, id: "apresentacao" },
    { t: "p", texto: T.APRESENTACAO_GERAL, id: "apresentacao" }
  ]);
  marca("Apresentação", foco, "PROPOSTA");

  const potBlocos = [
    { t: "h2", texto: "Seus potenciais naturais" },
    { t: "p", texto: pot.texto },
    { t: "h3", texto: "Onde reconhecer esse potencial" },
    { t: "p", texto: pot.reconhecer }
  ];
  marca("Bloco I", `P${String(P).padStart(2, "0")}`, "CELSO");
  if (calc.nome.variacao && T.VARIACOES_NOME_TXT[calc.nome.variacao]) {
    potBlocos.push({ t: "p", texto: T.VARIACOES_NOME_TXT[calc.nome.variacao] });
    marca("Bloco I · variação", calc.nome.variacao, calc.nome.variacao === 46 ? "PROPOSTA" : "CELSO");
  }
  potBlocos.push({ t: "h3", texto: "Como colocar em prática" }, { t: "p", texto: pot.pratica });
  potBlocos.push({ t: "h3", texto: "Como usar seu Mapa" }, { t: "p", texto: T.COMO_USAR[foco] });
  doc[0].blocos.push(...potBlocos);

  // 2. Satisfação e convivência
  const sat = [{ t: "h1", texto: "Satisfação e convivência" }];
  const v = calc.nome.vogais, c = calc.nome.consoantes;
  if (!v.ausente) { sat.push({ t: "h2", texto: "O que lhe dá satisfação" }, { t: "p", texto: T.SATISFACAO[v.valor].texto }); marca("Vogais", v.valor, "ADAPTADO"); }
  if (!c.ausente) { sat.push({ t: "h2", texto: "A impressão que você pode transmitir" }, { t: "p", texto: T.IMPRESSAO[c.valor].texto }); marca("Consoantes", c.valor, c.valor === 2 ? "PROPOSTA" : "ADAPTADO"); }
  if (!v.ausente && !c.ausente) {
    sat.push({ t: "h2", texto: "Uma escolha prática", id: "escolha" },
      { t: "p", id: "escolha", texto: `Procure ${T.SATISFACAO[v.valor].situacao}. Nessas situações, as pessoas tendem a perceber em você ${T.IMPRESSAO[c.valor].percepcao}. Para que essa impressão trabalhe a seu favor, ${T.IMPRESSAO[c.valor].ajuste}.` });
    marca("Escolha prática", `${v.valor}/${c.valor}`, "PROPOSTA");
  }
  secao("satisfacao", "Satisfação e convivência", sat);

  // 3. Capacidades, combinação, aspectos a fortalecer e orientação do momento
  const capBlocos = [{ t: "h1", texto: "Capacidades a desenvolver e equilibrar" }, { t: "p", texto: capd.texto }];
  marca("Bloco II", `Data ${String(D).padStart(2, "0")}`, "CELSO");
  if (calc.data.variacao && T.VARIACOES_DATA_TXT[calc.data.variacao]) {
    capBlocos.push({ t: "p", texto: T.VARIACOES_DATA_TXT[calc.data.variacao] });
    marca("Bloco II · variação", calc.data.variacao, "CELSO");
  } else if (calc.data.variacao) {
    marca("Bloco II · variação", calc.data.variacao, "FALTA TEXTO — usado só o texto-base");
  }

  capBlocos.push({ t: "h2", texto: "Como esses aspectos se combinam", id: "combinam" });
  if (calc.coincidencia) {
    capBlocos.push(
      { t: "p", id: "combinam", texto: `Neste Mapa, o que você faz com naturalidade e o que pode desenvolver apontam na mesma direção. ${cap(fp.recurso)} é também a capacidade que vale aprimorar. Isso dá força ao potencial e pede atenção para que ele seja usado na medida de cada situação.` },
      { t: "p", id: "combinam", texto: `${fd.situacao} Use ${fp.recurso} e, antes de concluir, ${T.CUIDADO_COINCIDENTE[D]}.` },
      { t: "p", id: "combinam", texto: `Vale observar também um ponto: ${fa.sinal}. Quando perceber isso, ${fa.ajuste}.` });
    marca("Combinação", `coincidência ${D} + aspecto ${A0}`, "PROPOSTA");
  } else {
    capBlocos.push(
      { t: "p", id: "combinam", texto: `${cap(fp.recurso)} pode ser o seu ponto de apoio para ${fd.objetivo}. ${fd.situacao} Nessa hora, experimente ${fp.gesto} e observe o que muda na conversa ou no resultado.` },
      { t: "p", id: "combinam", texto: `Nesse caminho, vale observar um ponto: ${fa.sinal}. Quando perceber isso, ${fa.ajuste}.` });
    marca("Combinação", `${P} + ${D} + aspecto ${A0}`, "PROPOSTA");
  }
  secao("capacidades", "Capacidades a desenvolver e equilibrar", capBlocos, { novaPagina: true });

  const aspBlocos = [{ t: "h1", texto: "Aspectos a fortalecer" }, { t: "p", texto: T.ASPECTOS_ABERTURA }];
  for (const a of aspectos) {
    const tx = T.ASPECTOS[a.valor];
    aspBlocos.push({ t: "h2", texto: tx.titulo }, { t: "p", texto: tx.texto }, { t: "pLabel", label: "Como praticar.", texto: tx.pratica });
    marca("Bloco III", a.valor, "CELSO");
  }
  // Orientação do momento (Ano Pessoal)
  const m = calc.momento;
  aspBlocos.push({ t: "h2", texto: "Para este momento", manterComProximo: true });
  if (m.tipo === "passagem") {
    aspBlocos.push({ t: "h3", texto: "O que este período lhe mostrou" }, { t: "p", texto: T.ANO_PESSOAL[m.retro.valor].retro });
    aspBlocos.push({ t: "h3", texto: `O que vale priorizar em ${m.prioridade.ano}` }, { t: "p", texto: T.ANO_PESSOAL[m.prioridade.valor].prioridade });
    marca("Ano Pessoal", `retro ${m.retro.ano}=${m.retro.valor}; prioridade ${m.prioridade.ano}=${m.prioridade.valor}`, "ADAPTADO");
  } else {
    aspBlocos.push({ t: "h3", texto: "O que vale priorizar neste momento" }, { t: "p", texto: T.ANO_PESSOAL[m.prioridade.valor].prioridade });
    marca("Ano Pessoal", `${m.prioridade.ano}=${m.prioridade.valor}`, "ADAPTADO");
  }
  secao("aspectos", "Aspectos a fortalecer", aspBlocos);

  // 4. Na vida pessoal e profissional
  const toque = T.LAZER_TOQUE[D] ? ` ${T.LAZER_TOQUE[D]}` : "";
  const vida = [
    { t: "h1", texto: "Na vida pessoal e profissional" },
    { t: "h2", texto: "Na vida pessoal" },
    { t: "p", texto: T.VIDA_PESSOAL[P], id: "vida_pessoal" },
    { t: "pLabel", label: "Para descontrair.", texto: T.LAZER[P] + toque }
  ];
  vida.push({ t: "h2", texto: "Na vida profissional" });
  if (foco === "retomada") {
    vida.push(
      { t: "pLabel", label: "O que ativar.", texto: `${cap(fp.recurso)}. É o recurso que você já tem e pode colocar em uso agora.` },
      { t: "pLabel", label: "O que trabalhar.", texto: `A capacidade de ${fd.objetivo}.` },
      { t: "pLabel", label: "O que evitar.", texto: `${cap(fa.evitar)}.` });
  } else {
    vida.push({ t: "p", texto: "Na escolha de uma formação ou direção profissional, experimentar antes de decidir costuma valer mais do que esperar uma certeza. Os dois caminhos abaixo podem ser testados com pouco compromisso e comparados depois." });
  }
  const [f1, f2] = calc.coincidencia || !T.FRENTES[D] ? T.FRENTES[P] : [T.FRENTES[P][0], T.FRENTES[D][0]];
  [f1, f2].forEach((f, i) => {
    const como = foco === "vocacional"
      ? `Converse com alguém que trabalhe em uma destas áreas (${f.areas}) e pergunte como é uma semana comum. Depois, ${f.tarefa}.`
      : `Em um prazo de duas a quatro semanas, ${f.tarefa}, como serviço, colaboração ou trabalho voluntário. Combine com alguém como vocês vão saber se deu resultado.`;
    vida.push({ t: "h3", texto: `Caminho ${i + 1} · ${f.titulo}` },
      { t: "p", texto: `${cap(f.descricao)}. Áreas em que isso aparece: ${f.areas}.` },
      { t: "pLabel", label: "Como experimentar.", texto: como });
  });
  vida.push({ t: "pLabel", label: "Como comparar.", texto: foco === "vocacional"
    ? "Depois das duas experiências, responda: em qual delas o tempo passou mais rápido? Em qual você aprendeu algo que quer aprofundar? Em qual as pessoas reagiram melhor ao que você fez? Uma escolha mais segura costuma nascer dessas observações, e não de uma certeza antecipada."
    : "Ao final de cada experiência, anote o que funcionou, o que cansou mais do que o esperado e o que coube na sua rotina atual. Use essa comparação para decidir qual caminho ativar com mais tempo nos próximos meses." });
  marca("Vida pessoal e profissional", `${P}/${D}/${foco}`, "PROPOSTA");
  secao("vida", "Na vida pessoal e profissional", vida);

  // 5. Como você se expressa — Planos de Expressão
  const ordem = ["mental", "fisico", "emocional", "intuitivo"];
  const pl = ordem.map(k => ({ k, ...calc.nome.planos[k], ...T.PLANOS[k] }));
  const max = Math.max(...pl.map(x => x.percentual)), min = Math.min(...pl.map(x => x.percentual));
  const unicoMax = pl.filter(x => x.percentual === max).length === 1, unicoMin = pl.filter(x => x.percentual === min).length === 1;
  const planBlocos = [{ t: "h1", texto: "Como você se expressa" }, { t: "p", texto: T.PLANOS_INTRO }];
  for (const x of pl) {
    let pre = "";
    if (unicoMax && x.percentual === max && max - min > 4) pre = "É o plano mais presente nesta distribuição. ";
    if (unicoMin && x.percentual === min && max - min > 4) pre = "É o plano menos presente nesta distribuição. ";
    planBlocos.push({ t: "h3", texto: `${x.nome} · ${x.percentual}%` }, { t: "p", texto: pre + x[nivelPlano(x.percentual)] });
  }
  const ord = [...pl].sort((a, b) => b.fracao - a.fracao);
  const conj = max - min <= 8
    ? "Os quatro planos aparecem de forma equilibrada. Isso facilita transitar entre analisar, agir, ouvir e perceber; o cuidado é escolher conscientemente qual deles a situação pede."
    : `Na sua distribuição, ${ord[0].papel} (${ord[0].nome}) costuma tomar a frente, enquanto ${ord[3].papel} (${ord[3].nome}) tende a ficar em segundo plano e vale ser exercitada de propósito.`;
  planBlocos.push({ t: "h2", texto: "Como os planos trabalham juntos", id: "planos_conjunta" },
    { t: "p", id: "planos_conjunta", texto: `${conj} Numa mesma tarefa, a percepção sugere uma possibilidade, a análise dá ordem às ideias, a escuta orienta o ajuste e a prática mostra se a ideia funciona. Experimente percorrer essas etapas na próxima vez que precisar apresentar ou decidir algo.` });
  planBlocos.push({ t: "grafico", planos: pl.map(x => ({ nome: x.nome, percentual: x.percentual, fracao: x.fracao })), nota: T.PLANOS_NOTA });
  marca("Planos de Expressão", pl.map(x => `${x.nome} ${x.percentual}% (${nivelPlano(x.percentual)})`).join(", "), "PROPOSTA");
  secao("planos", "Como você se expressa", planBlocos, { novaPagina: true });

  // 6. Experimente a partir de agora + quadro + reflexão final
  secao("final", "Experimente a partir de agora", [
    { t: "h1", texto: "Experimente a partir de agora" },
    { t: "p", id: "experimente", texto: `Nas próximas duas semanas, escolha uma situação real em que você possa ${fd.objetivo}. Comece por ${fp.gesto}. Depois, registre no quadro o que fez, o que observou e o que vai ajustar na próxima tentativa.` },
    { t: "quadro", colunas: ["Situação", "Ação", "Resultado observado", "Próximo ajuste"], linhas: 3 },
    { t: "h2", texto: "Uma reflexão final — E agora?" },
    { t: "bullets", itens: T.PERGUNTAS_FINAIS },
    { t: "destaque", texto: T.FRASE_FINAL }
  ], { novaPagina: true });
  marca("Experimente", `${P}/${D}`, "PROPOSTA");

  const revisao = {
    versao: VERSAO_ANALISE,
    foco,
    relato: relato || "",
    calculo: {
      nomePorParte: calc.nome.partes.map(p => `${p.parte} ${p.bruto}`).join(" · "),
      nomeTotal: calc.nome.cadeia.join(" → "),
      vogais: v.ausente ? "ausentes" : v.cadeia.join(" → "),
      consoantes: c.ausente ? "ausentes" : c.cadeia.join(" → "),
      data: calc.data.cadeia.join(" → ") + (calc.data.variacao ? ` (variação ${calc.data.variacao})` : ""),
      smSdSa: `${calc.data.SM}, ${calc.data.SD}, ${calc.data.SA}`,
      d1d2d3d4: `${calc.data.D1}, ${calc.data.D2}, ${calc.data.D3}, ${calc.data.D4} → exibidos: ${aspectos.map(a => a.valor).join(", ")}`,
      planos: ordem.map(k => `${T.PLANOS[k].nome} ${calc.nome.planos[k].quantidade}/${calc.nome.totalLetras} = ${calc.nome.planos[k].percentual}%`).join(" · "),
      anoPessoal: m.tipo === "passagem" ? `${m.retro.ano} = ${m.retro.bruto} → ${m.retro.valor}; ${m.prioridade.ano} = ${m.prioridade.bruto} → ${m.prioridade.valor}` : `${m.prioridade.ano} = ${m.prioridade.bruto} → ${m.prioridade.valor}`,
      coincidencia: calc.coincidencia ? `sim (${P})` : "não"
    },
    textos: usados,
    alertas: [...calc.alertas]
  };
  return { calc, doc, revisao, nomeExibicao: exib, primeiroNome: primeiro };
}

/** Confere se algum termo proibido chegou ao texto do cliente. Devolve a lista de ocorrências. */
export function conferirTermos(doc) {
  const achados = [];
  for (const s of doc) for (const b of s.blocos) {
    const textos = [b.texto, b.label, b.nome, ...(b.itens || [])].filter(Boolean);
    for (const tx of textos) for (const re of T.TERMOS_PROIBIDOS) if (re.test(tx)) achados.push(`${s.id}: ${re} em “${tx.slice(0, 60)}…”`);
  }
  return achados;
}

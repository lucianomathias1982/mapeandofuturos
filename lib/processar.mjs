// Processamento de um pedido pago: gera o PDF, envia para revisão (ou aprova) e entrega.
// Idempotente: pode ser chamado várias vezes (webhook repetido, retentativa agendada, botão do admin)
// sem duplicar a geração nem a entrega.
import crypto from "node:crypto";
import { lerPedido, salvarPedido, salvarPdf, lerPdf, LIMITE_TENTATIVAS } from "./pedidos.mjs";
import { montarAnalise, conferirTermos } from "./analise.mjs";
import { redigirComIA } from "./redacao-ia.mjs";
import { gerarPdf } from "./pdf.mjs";
import { enviarMapaCliente, enviarParaRevisao, enviarAlerta } from "./email.mjs";
import { VERSAO_ANALISE, hojeSaoPaulo } from "./calc.mjs";
import * as T from "./textos.mjs";

const TRAVA_MS = 10 * 60 * 1000;
export const revisaoManual = () => !/^(nao|não|false|0|off)$/i.test(process.env.REVISAO_MANUAL || "sim");
const site = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");

export function assinar(orderId, acao) {
  return crypto.createHmac("sha256", process.env.ADMIN_TOKEN || "defina-ADMIN_TOKEN").update(`${orderId}:${acao}`).digest("base64url").slice(0, 32);
}
export function conferirAssinatura(orderId, acao, ass) {
  const esperado = assinar(orderId, acao);
  return typeof ass === "string" && ass.length === esperado.length && crypto.timingSafeEqual(Buffer.from(ass), Buffer.from(esperado));
}
export const linkRevisao = id => `${site()}/.netlify/functions/revisao?pedido=${id}&ass=${assinar(id, "revisar")}`;

/** Dispara o processamento em segundo plano (função background, até 15 min). */
export async function dispararProcessamento(orderId) {
  if (process.env.MF_MEMORIA) return processarPedido(orderId);
  try {
    await fetch(`${site()}/.netlify/functions/processar-pedido-background`, {
      method: "POST", headers: { "content-type": "application/json", "x-mf-segredo": assinar(orderId, "processar") }, body: JSON.stringify({ orderId })
    });
  } catch (e) { console.error("disparo falhou; a retentativa agendada assume", e.message); }
}

async function gerar(p) {
  const tentativas = (p.tentativasGeracao || 0) + 1;
  // A data de referência (São Paulo) fica fixada na primeira geração, para que uma nova tentativa produza o mesmo Mapa.
  p = await salvarPedido(p, "gerando", { gerandoDesde: new Date().toISOString(), tentativasGeracao: tentativas, dataReferencia: p.dataReferencia || hojeSaoPaulo() });
  try {
    const a = montarAnalise({ nome: p.nome, dataNascimento: p.dataNascimento, foco: p.foco, relato: p.relato,
      hoje: p.dataReferencia || undefined, retroJaneiroAteDia: Number(process.env.RETRO_JANEIRO_ATE_DIA || 0) });
    let doc = a.doc, redacaoIA = "não";
    if (p.relato) {
      const calc = a.calc;
      const ia = await redigirComIA({ doc, relato: p.relato, foco: p.foco, primeiroNome: a.primeiroNome, contexto: {
        potencial_natural: T.POTENCIAIS[calc.nome.perfil].titulo,
        capacidade_a_desenvolver: T.CAPACIDADES[calc.data.perfil].titulo,
        aspectos_a_fortalecer: calc.data.aspectos.map(x => T.ASPECTOS[x.valor].titulo),
        nome_e_data_coincidem: calc.coincidencia
      } });
      doc = ia.doc;
      redacaoIA = ia.usado ? `sim (${ia.aceitos.join(", ")}${ia.recusados?.length ? "; mantidos: " + ia.recusados.join(", ") : ""})` : (ia.erro || "não");
    }
    if (process.env.MF_MEMORIA && process.env.MF_SIMULAR_FALHA_PDF) throw new Error("falha simulada de geração");
    const termos = conferirTermos(doc);
    if (termos.length) throw new Error("Termos proibidos no texto: " + termos.join(" | "));
    const pdf = await gerarPdf({ doc, nomeExibicao: a.nomeExibicao, pedido: p.orderId, versao: VERSAO_ANALISE });
    await salvarPdf(p.orderId, pdf);
    const proximo = revisaoManual() ? "em_revisao" : "aprovado";
    return await salvarPedido(p, proximo, { revisao: a.revisao, redacaoIA, versaoAnalise: VERSAO_ANALISE, geradoEm: new Date().toISOString(), gerandoDesde: null });
  } catch (e) {
    console.error("falha na geração", p.orderId, e);
    p = await salvarPedido(p, "falha_geracao", { motivo: String(e.message).slice(0, 300), gerandoDesde: null });
    if (tentativas >= LIMITE_TENTATIVAS) await enviarAlerta(`Falha na geração ${p.orderId}`, `${tentativas} tentativas. Último erro: ${e.message}`);
    return p;
  }
}

async function pedirRevisao(p) {
  try {
    const pdf = await lerPdf(p.orderId);
    if (!pdf) return salvarPedido(p, "falha_geracao", { motivo: "PDF não encontrado para revisão" });
    await enviarParaRevisao(p, pdf, linkRevisao(p.orderId));
    return salvarPedido(p, null, { revisaoEnviadaEm: new Date().toISOString() });
  } catch (e) {
    const t = (p.tentativasRevisao || 0) + 1;
    if (t >= LIMITE_TENTATIVAS) await enviarAlerta(`Revisão não enviada ${p.orderId}`, e.message);
    return salvarPedido(p, null, { tentativasRevisao: t, motivoRevisao: String(e.message).slice(0, 300) });
  }
}

async function entregar(p) {
  const tentativas = (p.tentativasEntrega || 0) + 1;
  p = await salvarPedido(p, "entregando", { entregandoDesde: new Date().toISOString(), tentativasEntrega: tentativas });
  try {
    const pdf = await lerPdf(p.orderId);
    if (!pdf) throw new Error("PDF não encontrado");
    const r = await enviarMapaCliente(p, pdf);
    return await salvarPedido(p, "entregue", { entregueEm: new Date().toISOString(), messageId: r.messageId, entregandoDesde: null });
  } catch (e) {
    console.error("falha na entrega", p.orderId, e);
    p = await salvarPedido(p, "falha_entrega", { motivo: String(e.message).slice(0, 300), entregandoDesde: null });
    if (tentativas >= LIMITE_TENTATIVAS) await enviarAlerta(`Falha na entrega ${p.orderId}`, `${tentativas} tentativas para ${p.email}. Último erro: ${e.message}`);
    return p;
  }
}

const velho = iso => !iso || Date.now() - Date.parse(iso) > TRAVA_MS;

/** Avança o pedido até onde for possível. Devolve o pedido atualizado. */
export async function processarPedido(orderId, { forcar = false } = {}) {
  let p = await lerPedido(orderId);
  if (!p) return null;
  for (let passo = 0; passo < 4; passo++) {
    const s = p.status;
    if (s === "pago" || (s === "falha_geracao" && (forcar || (p.tentativasGeracao || 0) < LIMITE_TENTATIVAS)) || (s === "gerando" && velho(p.gerandoDesde))) {
      p = await gerar(p); forcar = false;
      if (p.status === "falha_geracao") return p; // a retentativa agendada tenta de novo mais tarde
      continue;
    }
    if (s === "em_revisao") {
      if (!p.revisaoEnviadaEm && (forcar || (p.tentativasRevisao || 0) < LIMITE_TENTATIVAS)) p = await pedirRevisao(p);
      return p; // aguarda a aprovação de Celso
    }
    if (s === "aprovado" || (s === "falha_entrega" && (forcar || (p.tentativasEntrega || 0) < LIMITE_TENTATIVAS)) || (s === "entregando" && velho(p.entregandoDesde))) {
      p = await entregar(p); forcar = false;
      if (p.status === "falha_entrega") return p;
      continue;
    }
    return p; // entregue, aguardando pagamento, em andamento recente ou falha esgotada
  }
  return p;
}

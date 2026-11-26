// Painel simples de administração. Todas as ações exigem ?token=ADMIN_TOKEN.
//   ?acao=lista                                   → pedidos recentes e seus estados
//   ?acao=status&pedido=MF-…                      → detalhes de um pedido
//   ?acao=reprocessar&pedido=MF-…                 → tenta de novo a geração/entrega (zera o limite)
//   ?acao=reenviar&pedido=MF-…                    → reenvia o PDF já aprovado ao cliente
//   ?acao=amostra&nome=…&data=DD/MM/AAAA&foco=vocacional|retomada[&geracao=DD/MM/AAAA]
//                                                 → gera um PDF de teste, sem pagamento e sem e-mail
import crypto from "node:crypto";
import { lerPedido, listarPedidos, salvarPedido } from "../../lib/pedidos.mjs";
import { processarPedido, linkRevisao } from "../../lib/processar.mjs";
import { montarAnalise, conferirTermos } from "../../lib/analise.mjs";
import { gerarPdf } from "../../lib/pdf.mjs";
import { parseData } from "../../lib/calc.mjs";

const json = (o, status = 200) => new Response(JSON.stringify(o, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const tokenOk = t => {
  const a = Buffer.from(String(t || "")), b = Buffer.from(String(process.env.ADMIN_TOKEN || ""));
  return b.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export default async (req) => {
  const u = new URL(req.url), q = k => u.searchParams.get(k);
  if (!tokenOk(q("token") || req.headers.get("x-admin-token"))) return json({ erro: "não autorizado" }, 401);
  const acao = q("acao") || "lista";

  if (acao === "amostra") {
    try {
      const g = q("geracao") ? parseData(q("geracao"), { dia: 31, mes: 12, ano: 9999 }) : null;
      const a = montarAnalise({ nome: q("nome"), dataNascimento: q("data"), foco: q("foco") || "vocacional", hoje: g && !g.erro ? g : undefined,
        retroJaneiroAteDia: Number(process.env.RETRO_JANEIRO_ATE_DIA || 0) });
      const termos = conferirTermos(a.doc);
      if (termos.length) return json({ erro: "termos proibidos", termos }, 500);
      if (q("formato") === "json") return json(a.revisao);
      const pdf = await gerarPdf({ doc: a.doc, nomeExibicao: a.nomeExibicao, pedido: "AMOSTRA" });
      return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=amostra.pdf" } });
    } catch (e) { return json({ erro: e.message }, 400); }
  }
  if (acao === "lista") {
    const ps = await listarPedidos();
    return json(ps.slice(0, 100).map(p => ({ pedido: p.orderId, status: p.status, foco: p.foco, nome: p.nome, email: p.email, criadoEm: p.criadoEm, pagoEm: p.pagoEm, entregueEm: p.entregueEm, motivo: p.motivo })));
  }
  const p = await lerPedido(q("pedido"));
  if (!p) return json({ erro: "pedido não encontrado" }, 404);
  if (acao === "status") return json({ ...p, linkRevisao: p.status === "em_revisao" ? linkRevisao(p.orderId) : undefined });
  if (acao === "reprocessar") return json(await processarPedido(p.orderId, { forcar: true }));
  if (acao === "reenviar") {
    if (!["entregue", "falha_entrega"].includes(p.status)) return json({ erro: `situação ${p.status} não permite reenvio` }, 409);
    await salvarPedido(p, "aprovado", { motivo: "reenvio manual" });
    return json(await processarPedido(p.orderId, { forcar: true }));
  }
  return json({ erro: "ação desconhecida" }, 400);
};

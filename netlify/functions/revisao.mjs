// Página de revisão de Celso. O link chega por e-mail.
// GET  → mostra o pedido, o botão para abrir o PDF e o botão "Aprovar e enviar".
// POST → aprova e dispara a entrega. (A aprovação exige o clique no botão: leitores de e-mail
//        que abrem links automaticamente não conseguem aprovar sozinhos.)
import { lerPedido, salvarPedido, lerPdf } from "../../lib/pedidos.mjs";
import { conferirAssinatura, dispararProcessamento } from "../../lib/processar.mjs";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pagina = (titulo, corpo) => new Response(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{margin:0;background:#FFFCF7;color:#0E2A3B;font:20px/1.5 Arial,Helvetica,sans-serif}main{max-width:620px;margin:0 auto;padding:40px 22px}h1{font-size:30px;line-height:1.2}
.b{display:block;width:100%;box-sizing:border-box;text-align:center;font-size:22px;font-weight:bold;padding:22px;border-radius:14px;margin:18px 0;text-decoration:none;border:0;cursor:pointer}
.azul{background:#1F6E9C;color:#fff}.claro{background:#E4F2FB;color:#1F6E9C}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:18px}dt{color:#4F6473}dd{margin:0;font-weight:bold}.ok{background:#DFF3EE;padding:18px;border-radius:12px}</style></head><body><main>${corpo}</main></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("pedido"), ass = url.searchParams.get("ass");
  if (!conferirAssinatura(id, "revisar", ass)) return pagina("Link inválido", "<h1>Este link não é válido.</h1><p>Use o botão do e-mail de revisão mais recente.</p>");
  let p = await lerPedido(id);
  if (!p) return pagina("Pedido não encontrado", "<h1>Pedido não encontrado.</h1>");

  if (url.searchParams.get("ver") === "pdf") {
    const pdf = await lerPdf(id);
    if (!pdf) return pagina("PDF indisponível", "<h1>O PDF ainda não está pronto.</h1>");
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${id}.pdf"`, "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    if (p.status === "em_revisao") {
      p = await salvarPedido(p, "aprovado", { aprovadoEm: new Date().toISOString() });
      await dispararProcessamento(id);
    }
    if (["aprovado", "entregando", "entregue"].includes(p.status)) {
      return pagina("Aprovado", `<div class="ok"><h1>Pronto. O Mapa foi aprovado.</h1><p>Ele será enviado agora para <b>${esc(p.email)}</b>. Você não precisa fazer mais nada.</p></div><p>Pode fechar esta página.</p>`);
    }
    return pagina("Não foi possível aprovar", `<h1>Este pedido não está aguardando revisão.</h1><p>Situação atual: ${esc(p.status)}.</p>`);
  }

  const primeiro = String(p.nome).split(/\s+/)[0];
  const linkPdf = `?pedido=${encodeURIComponent(id)}&ass=${encodeURIComponent(ass)}&ver=pdf`;
  if (p.status === "entregue") return pagina("Já enviado", `<div class="ok"><h1>Este Mapa já foi enviado.</h1><p>Enviado para <b>${esc(p.email)}</b>.</p></div><a class="b claro" href="${linkPdf}" target="_blank">Ver o PDF enviado</a>`);
  if (p.status !== "em_revisao") return pagina("Aguarde", `<h1>Este Mapa não está aguardando revisão.</h1><p>Situação atual: ${esc(p.status)}.</p>`);

  return pagina(`Revisar Mapa de ${primeiro}`, `
    <h1>Revisar o Mapa de ${esc(primeiro)}</h1>
    <dl><dt>Nome</dt><dd>${esc(p.nome)}</dd><dt>Nascimento</dt><dd>${esc(p.dataNascimento)}</dd><dt>Foco</dt><dd>${p.foco === "vocacional" ? "Vocacional" : "Caminho da Retomada"}</dd><dt>Enviar para</dt><dd>${esc(p.email)}</dd></dl>
    <p><b>Passo 1.</b> Leia o Mapa.</p>
    <a class="b claro" href="${linkPdf}" target="_blank">Abrir o PDF do Mapa</a>
    <p><b>Passo 2.</b> Se estiver tudo certo, aperte o botão azul. O Mapa vai na mesma hora para o cliente.</p>
    <form method="post"><button class="b azul" type="submit">Aprovar e enviar ao cliente</button></form>
    <p>Se precisar mudar alguma coisa, <b>não aperte o botão azul</b>. Responda ao e-mail de revisão dizendo o que mudar.</p>`);
};

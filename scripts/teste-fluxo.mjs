// Teste de ponta a ponta do fluxo do pedido, sem rede: armazenamento em memória e e-mails gravados em /tmp.
// Cobre: validação do checkout, confirmação de pagamento repetida, geração, revisão, aprovação repetida,
// entrega, falha temporária de geração e de entrega, e o modo sem revisão manual.
process.env.MF_MEMORIA = "1";
process.env.ADMIN_TOKEN = "token-de-teste-com-mais-de-16-caracteres";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_teste";
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.PRICE_VOCACIONAL = "price_v"; process.env.PRICE_RETOMADA = "price_r";
process.env.SITE_URL = "https://mapeandofuturos.com";
process.env.REVISOR_EMAIL = "celso@example.com";
process.env.REVISAO_MANUAL = "sim"; // os primeiros testes cobrem o modo com aprovação de Celso

import assert from "node:assert/strict";
import fs from "node:fs";
import Stripe from "stripe";
const { salvarPedido, lerPedido } = await import("../lib/pedidos.mjs");
const { processarPedido, assinar } = await import("../lib/processar.mjs");
const checkout = (await import("../netlify/functions/create-checkout.mjs")).default;
const webhook = (await import("../netlify/functions/stripe-webhook.mjs")).default;
const revisao = (await import("../netlify/functions/revisao.mjs")).default;
const admin = (await import("../netlify/functions/admin.mjs")).default;

let ok = 0; const t = async (n, f) => { await f(); ok++; console.log("✓", n); };
const emails = () => fs.readdirSync("/tmp").filter(f => f.startsWith("mf-email-")).length;
for (const f of fs.readdirSync("/tmp").filter(f => f.startsWith("mf-email-"))) fs.unlinkSync("/tmp/" + f);
const post = (url, body, headers = {}) => new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

const stripe = new Stripe("sk_test_x");
function eventoPago(orderId, id = "evt_1") {
  const payload = JSON.stringify({ id, type: "checkout.session.completed", data: { object: { id: "cs_test_1", client_reference_id: orderId, payment_status: "paid", amount_total: 24000, metadata: { orderId } } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return post("https://x/.netlify/functions/stripe-webhook", payload, { "stripe-signature": header });
}
const novoPedido = (orderId, extra = {}) => salvarPedido({ orderId, status: "aguardando_pagamento", foco: "vocacional", nome: "Luciano Mathias Pereira de Andrade Junqueira", dataNascimento: "02/08/1982", email: "cliente@example.com", relato: "", menor: false, criadoEm: new Date().toISOString(), dataReferencia: { dia: 26, mes: 11, ano: 2026 }, ...extra });

await t("Checkout recusa data inexistente, nome incompleto e menor sem responsável", async () => {
  const base = { foco: "vocacional", nome: "Ana Luz", dataNascimento: "02/08/1982", email: "a@b.com", c_dados: 1, c_lgpd: 1, c_ciente: 1 };
  let r = await checkout(post("https://x", { ...base, dataNascimento: "31/02/2001" })); assert.equal(r.status, 400);
  r = await checkout(post("https://x", { ...base, nome: "Ana" })); assert.equal(r.status, 400);
  r = await checkout(post("https://x", { ...base, dataNascimento: "10/10/2012" })); assert.equal(r.status, 400);
  assert.match((await r.json()).error, /responsável/);
  r = await checkout(post("https://x", { ...base, c_dados: 0 })); assert.equal(r.status, 400);
});

await novoPedido("MF-TESTE0001");
await t("Webhook com assinatura inválida é recusado", async () => {
  const r = await webhook(post("https://x", "{}", { "stripe-signature": "t=1,v1=x" })); assert.equal(r.status, 400);
});
await t("Pagamento confirmado → PDF gerado → enviado para revisão", async () => {
  const r = await webhook(eventoPago("MF-TESTE0001")); assert.equal(r.status, 200);
  const p = await lerPedido("MF-TESTE0001");
  assert.equal(p.status, "em_revisao"); assert.ok(p.revisaoEnviadaEm); assert.equal(p.revisao.calculo.nomeTotal, "183 → 12 → 3");
  assert.equal(emails(), 1);
});
await t("Confirmação de pagamento repetida não duplica geração nem revisão", async () => {
  await webhook(eventoPago("MF-TESTE0001", "evt_2"));
  const p = await lerPedido("MF-TESTE0001");
  assert.equal(p.status, "em_revisao"); assert.equal(p.tentativasGeracao, 1); assert.equal(emails(), 1);
});
await t("Link de revisão: assinatura errada recusada; GET não aprova", async () => {
  let r = await revisao(new Request("https://x/?pedido=MF-TESTE0001&ass=errada")); assert.match(await r.text(), /não é válido/);
  r = await revisao(new Request(`https://x/?pedido=MF-TESTE0001&ass=${assinar("MF-TESTE0001", "revisar")}`)); assert.match(await r.text(), /Aprovar e enviar/);
  assert.equal((await lerPedido("MF-TESTE0001")).status, "em_revisao");
  r = await revisao(new Request(`https://x/?pedido=MF-TESTE0001&ass=${assinar("MF-TESTE0001", "revisar")}&ver=pdf`));
  assert.equal(r.headers.get("content-type"), "application/pdf");
});
await t("Aprovação → entrega ao cliente; segunda aprovação não reenvia", async () => {
  const url = `https://x/?pedido=MF-TESTE0001&ass=${assinar("MF-TESTE0001", "revisar")}`;
  await revisao(new Request(url, { method: "POST" }));
  let p = await lerPedido("MF-TESTE0001");
  assert.equal(p.status, "entregue"); assert.equal(emails(), 2);
  await revisao(new Request(url, { method: "POST" }));
  p = await lerPedido("MF-TESTE0001"); assert.equal(p.tentativasEntrega, 1); assert.equal(emails(), 2);
});

await t("Falha temporária de geração é recuperada na retentativa", async () => {
  await novoPedido("MF-TESTE0002", { status: "pago" });
  process.env.MF_SIMULAR_FALHA_PDF = "1";
  let p = await processarPedido("MF-TESTE0002"); assert.equal(p.status, "falha_geracao");
  delete process.env.MF_SIMULAR_FALHA_PDF;
  p = await processarPedido("MF-TESTE0002"); assert.equal(p.status, "em_revisao"); assert.equal(p.tentativasGeracao, 2);
});
await t("Falha temporária de entrega é recuperada sem regenerar o PDF", async () => {
  let p = await lerPedido("MF-TESTE0002");
  await salvarPedido(p, "aprovado");
  process.env.MF_SIMULAR_FALHA_EMAIL = "1";
  p = await processarPedido("MF-TESTE0002"); assert.equal(p.status, "falha_entrega");
  delete process.env.MF_SIMULAR_FALHA_EMAIL;
  p = await processarPedido("MF-TESTE0002"); assert.equal(p.status, "entregue"); assert.equal(p.tentativasGeracao, 2); assert.equal(p.tentativasEntrega, 2);
});
await t("Padrão (entrega automática): vai direto ao cliente e Celso recebe uma cópia, sem duplicar", async () => {
  delete process.env.REVISAO_MANUAL;
  const antes = emails();
  await novoPedido("MF-TESTE0003", { foco: "retomada", nome: "José Carlos de Oliveira", dataNascimento: "03/05/1970" });
  await webhook(eventoPago("MF-TESTE0003", "evt_3"));
  let p = await lerPedido("MF-TESTE0003"); assert.equal(p.status, "entregue"); assert.ok(p.copiaEnviadaEm);
  assert.equal(emails() - antes, 2); // cliente + cópia
  await webhook(eventoPago("MF-TESTE0003", "evt_4"));
  p = await lerPedido("MF-TESTE0003"); assert.equal(p.status, "entregue"); assert.equal(emails() - antes, 2);
});
await t("Admin: token obrigatório; amostra gera PDF", async () => {
  let r = await admin(new Request("https://x/?acao=lista")); assert.equal(r.status, 401);
  r = await admin(new Request(`https://x/?token=${process.env.ADMIN_TOKEN}&acao=amostra&nome=Maria%20da%20Silva&data=15/03/2009&foco=vocacional`));
  assert.equal(r.headers.get("content-type"), "application/pdf");
  r = await admin(new Request(`https://x/?token=${process.env.ADMIN_TOKEN}&acao=lista`)); assert.equal((await r.json()).length, 3);
});
console.log(`\n${ok} verificações do fluxo aprovadas.`);

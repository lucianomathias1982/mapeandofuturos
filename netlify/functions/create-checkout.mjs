// Valida os dados confirmados, cria (ou reaproveita) o pedido e abre o Checkout da Stripe.
// Variáveis: STRIPE_SECRET_KEY, PRICE_VOCACIONAL, PRICE_RETOMADA, SITE_URL
import Stripe from "stripe";
import crypto from "node:crypto";
import { validarNome, parseData, idadeEm, VERSAO_ANALISE } from "../../lib/calc.mjs";
import { lerPedido, salvarPedido } from "../../lib/pedidos.mjs";

const PRICES = { vocacional: process.env.PRICE_VOCACIONAL, retomada: process.env.PRICE_RETOMADA };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const limpa = (s, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let d;
  try { d = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400); }

  if (!PRICES[d.foco]) return json({ error: "Escolha o foco do Mapa." }, 400);
  const nome = limpa(d.nome, 160);
  const erroNome = validarNome(nome);
  if (erroNome) return json({ error: erroNome, campo: "nome" }, 400);
  const nasc = parseData(d.dataNascimento);
  if (nasc.erro) return json({ error: nasc.erro, campo: "dataNascimento" }, 400);
  const email = limpa(d.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Confira o e-mail de entrega.", campo: "email" }, 400);
  const menor = idadeEm(nasc) < 18;
  if (menor && (!limpa(d.resp_nome) || !limpa(d.resp_parentesco))) return json({ error: "Para menores de 18 anos, informe o responsável legal.", campo: "resp_nome" }, 400);
  if (!d.c_dados || !d.c_lgpd || !d.c_ciente || (menor && !d.c_resp)) return json({ error: "Confirme os dados e as autorizações." }, 400);

  // A mesma "chave" (gerada no navegador) reaproveita o pedido: cliques repetidos não duplicam.
  const chave = limpa(d.chave, 80) || crypto.randomUUID();
  const orderId = "MF-" + crypto.createHash("sha256").update(chave).digest("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
  const existente = await lerPedido(orderId);
  if (existente && existente.status !== "aguardando_pagamento") return json({ error: "Este pedido já foi pago. Confira seu e-mail.", pago: true }, 409);
  if (existente?.checkoutUrl && existente.nome === nome && existente.dataNascimento === nasc.texto && existente.email === email
      && existente.foco === d.foco && Date.now() - Date.parse(existente.checkoutCriadoEm) < 20 * 3600 * 1000) {
    return json({ url: existente.checkoutUrl, orderId });
  }

  const base = {
    orderId, versaoAnalise: VERSAO_ANALISE, foco: d.foco,
    nome, dataNascimento: nasc.texto, relato: String(d.relato || "").trim().slice(0, 2000),
    email, whatsapp: limpa(d.whatsapp, 30), menor, resp_nome: menor ? limpa(d.resp_nome, 160) : "", resp_parentesco: menor ? limpa(d.resp_parentesco, 40) : "",
    consentimentos: { dados: true, lgpd: true, ciente: true, responsavel: menor ? true : undefined, em: new Date().toISOString() },
    criadoEm: existente?.criadoEm || new Date().toISOString()
  };
  let pedido = await salvarPedido({ ...(existente || {}), ...base, status: existente?.status || "aguardando_pagamento", historico: existente?.historico || [{ status: "aguardando_pagamento", em: base.criadoEm }] });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const site = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
  const versao = crypto.createHash("sha1").update(`${nome}|${nasc.texto}|${email}|${d.foco}`).digest("hex").slice(0, 8);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: PRICES[d.foco], quantity: 1 }],
    customer_email: email,
    client_reference_id: orderId,
    metadata: { orderId, foco: d.foco, menor: String(menor), versaoAnalise: VERSAO_ANALISE },
    payment_intent_data: { metadata: { orderId } },
    locale: "pt-BR",
    success_url: `${site}/?pedido=${orderId}#obrigado`,
    cancel_url: `${site}/#caminhos`
  }, { idempotencyKey: `checkout-${orderId}-${versao}` });

  await salvarPedido(pedido, null, { checkoutUrl: session.url, stripeSession: session.id, checkoutCriadoEm: new Date().toISOString() });
  return json({ url: session.url, orderId });
};

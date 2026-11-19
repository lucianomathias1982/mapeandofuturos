// Cria o pedido, guarda as respostas e abre uma sessão de Checkout da Stripe.
// Variáveis de ambiente: STRIPE_SECRET_KEY, PRICE_VOCACIONAL, PRICE_RETOMADA, SITE_URL
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRICES = { vocacional: process.env.PRICE_VOCACIONAL, retomada: process.env.PRICE_RETOMADA };

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let d;
  try { d = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  if (!PRICES[d.foco]) return json({ error: "Foco inválido" }, 400);
  if (!d.nome || !d.email || !d.idade) return json({ error: "Dados obrigatórios ausentes" }, 400);
  if (Number(d.idade) < 18 && !d.resp_nome) return json({ error: "Responsável obrigatório para menores" }, 400);

  const orderId = "MF-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const store = getStore("pedidos");
  await store.setJSON(orderId, { ...d, orderId, status: "aguardando_pagamento", criadoEm: new Date().toISOString() });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: PRICES[d.foco], quantity: 1 }],
    customer_email: d.email,
    client_reference_id: orderId,
    metadata: { orderId, foco: d.foco, menor: String(!!d.menor) },
    locale: "pt-BR",
    success_url: `${process.env.SITE_URL}/#obrigado`,
    cancel_url: `${process.env.SITE_URL}/#caminhos`
  });
  return json({ url: session.url });
};

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

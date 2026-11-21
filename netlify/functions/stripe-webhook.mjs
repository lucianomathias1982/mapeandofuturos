// Recebe a confirmação de pagamento da Stripe e dispara a produção do Mapa.
// Variáveis: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, AUTOMATION_WEBHOOK_URL
// AUTOMATION_WEBHOOK_URL = cenário do Make/n8n que gera o rascunho do PDF, envia para revisão de Celso
// e, após aprovação, entrega o PDF por e-mail ao cliente.
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async (req) => {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try { event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return new Response(`Webhook inválido: ${e.message}`, { status: 400 }); }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    if (s.payment_status !== "paid") return new Response("aguardando", { status: 200 });
    const store = getStore("pedidos");
    const orderId = s.client_reference_id;
    const pedido = await store.get(orderId, { type: "json" });
    if (!pedido) return new Response("pedido não encontrado", { status: 200 });
    if (pedido.status === "pago") return new Response("já processado", { status: 200 }); // idempotência

    const atualizado = { ...pedido, status: "pago", pagoEm: new Date().toISOString(), stripeSession: s.id, valorPago: s.amount_total / 100 };
    await store.setJSON(orderId, atualizado);
    if (process.env.AUTOMATION_WEBHOOK_URL) {
      await fetch(process.env.AUTOMATION_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(atualizado)
      }).catch(() => {});
    }
  }
  return new Response("ok", { status: 200 });
};

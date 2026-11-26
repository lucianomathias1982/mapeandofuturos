// Confirmação do pagamento pela Stripe. Idempotente: eventos repetidos não duplicam o pedido.
// Variáveis: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,
//          checkout.session.async_payment_failed, checkout.session.expired
import Stripe from "stripe";
import { lerPedido, salvarPedido } from "../../lib/pedidos.mjs";
import { dispararProcessamento } from "../../lib/processar.mjs";

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_x");
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try { event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return new Response(`Webhook inválido: ${e.message}`, { status: 400 }); }

  const s = event.data.object;
  const orderId = s.client_reference_id || s.metadata?.orderId;
  const pedido = orderId ? await lerPedido(orderId) : null;
  if (!pedido) return new Response("pedido não encontrado", { status: 200 });

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (s.payment_status !== "paid") return new Response("aguardando compensação", { status: 200 });
    if (pedido.status === "aguardando_pagamento" || pedido.status === "pagamento_falhou" || pedido.status === "expirado") {
      await salvarPedido(pedido, "pago", { pagoEm: new Date().toISOString(), stripeSession: s.id, valorPago: (s.amount_total || 0) / 100, eventoPagamento: event.id });
    }
    // Repetição do evento: apenas garante que o processamento siga (a função é idempotente).
    await dispararProcessamento(orderId);
  } else if (event.type === "checkout.session.async_payment_failed" && pedido.status === "aguardando_pagamento") {
    await salvarPedido(pedido, "pagamento_falhou", { motivo: "pagamento assíncrono recusado" });
  } else if (event.type === "checkout.session.expired" && pedido.status === "aguardando_pagamento") {
    await salvarPedido(pedido, "expirado", { checkoutUrl: null });
  }
  return new Response("ok", { status: 200 });
};

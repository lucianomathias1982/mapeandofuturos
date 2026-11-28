// Função em segundo plano (até 15 minutos): gera o Mapa, pede revisão ou entrega.
// Chamada pelo webhook, pela aprovação de Celso e pela retentativa agendada.
import { processarPedido, conferirAssinatura } from "../../lib/processar.mjs";

export default async (req) => {
  let orderId;
  try { ({ orderId } = await req.json()); } catch { return new Response("", { status: 400 }); }
  if (!conferirAssinatura(orderId, "processar", req.headers.get("x-mf-segredo"))) return new Response("", { status: 403 });
  await processarPedido(orderId);
  return new Response("", { status: 202 });
};

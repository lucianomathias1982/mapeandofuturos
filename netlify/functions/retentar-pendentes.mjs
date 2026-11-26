// Função agendada: a cada 30 minutos, retoma pedidos que pararam no meio
// (geração ou entrega com falha temporária, trava antiga, revisão não enviada, disparo perdido).
import { listarPedidos } from "../../lib/pedidos.mjs";
import { dispararProcessamento } from "../../lib/processar.mjs";

const RETOMAR = new Set(["pago", "gerando", "falha_geracao", "em_revisao", "aprovado", "entregando", "falha_entrega"]);

export default async () => {
  const pedidos = await listarPedidos();
  const alvo = pedidos.filter(p => RETOMAR.has(p.status) && !(p.status === "em_revisao" && p.revisaoEnviadaEm));
  for (const p of alvo) await dispararProcessamento(p.orderId);
  console.log(`retentativa: ${alvo.length} pedido(s) retomado(s)`);
};

export const config = { schedule: "*/30 * * * *" };

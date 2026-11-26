// Armazenamento dos pedidos e dos PDFs (Netlify Blobs) e registro dos estados.
// Estados: aguardando_pagamento → pago → gerando → em_revisao → aprovado → entregando → entregue
// Falhas recuperáveis: falha_geracao, falha_entrega. Outros: pagamento_falhou, expirado.
import { getStore } from "@netlify/blobs";

const memoria = new Map(); // usado só nos testes locais (MF_MEMORIA=1)
function storeMemoria(nome) {
  const pref = nome + ":";
  return {
    async get(k, o) { const v = memoria.get(pref + k); if (v == null) return null; return o?.type === "json" ? JSON.parse(v) : o?.type === "arrayBuffer" ? v : v; },
    async setJSON(k, v) { memoria.set(pref + k, JSON.stringify(v)); },
    async set(k, v) { memoria.set(pref + k, v); },
    async list() { return { blobs: [...memoria.keys()].filter(k => k.startsWith(pref)).map(k => ({ key: k.slice(pref.length) })) }; }
  };
}
const store = nome => process.env.MF_MEMORIA ? storeMemoria(nome) : getStore({ name: nome, consistency: "strong" });

export const LIMITE_TENTATIVAS = 5;

export async function lerPedido(id) {
  if (!/^MF-[A-Z0-9-]{4,40}$/.test(String(id || ""))) return null;
  return store("pedidos").get(id, { type: "json" });
}

export async function salvarPedido(p, novoStatus, extra = {}) {
  const agora = new Date().toISOString();
  const atualizado = { ...p, ...extra, atualizadoEm: agora };
  if (novoStatus && novoStatus !== p.status) {
    atualizado.status = novoStatus;
    atualizado.historico = [...(p.historico || []), { status: novoStatus, em: agora, ...(extra.motivo ? { motivo: extra.motivo } : {}) }];
  }
  await store("pedidos").setJSON(p.orderId, atualizado);
  return atualizado;
}

export async function listarPedidos() {
  const { blobs } = await store("pedidos").list();
  const out = [];
  for (const b of blobs) { const p = await store("pedidos").get(b.key, { type: "json" }); if (p) out.push(p); }
  return out.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

export async function salvarPdf(id, buf) { await store("mapas").set(`${id}.pdf`, buf); }
export async function lerPdf(id) {
  const v = await store("mapas").get(`${id}.pdf`, { type: "arrayBuffer" });
  return v ? Buffer.from(v) : null;
}

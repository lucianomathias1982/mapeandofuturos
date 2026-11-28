// Envio de e-mails pelo SMTP da Locaweb (ou qualquer SMTP).
// Variáveis: SMTP_HOST (padrão email-ssl.com.br), SMTP_PORT (padrão 465), SMTP_USER, SMTP_PASS, MAIL_FROM.
import nodemailer from "nodemailer";
import fs from "node:fs";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let transporte;
function smtp() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "email-ssl.com.br", port: porta, secure: porta === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporte;
}
const remetente = () => process.env.MAIL_FROM || `Mapeando Futuros <${process.env.SMTP_USER}>`;

async function enviar(msg) {
  if (process.env.MF_MEMORIA && process.env.MF_SIMULAR_FALHA_EMAIL) throw new Error("falha simulada de e-mail");
  const t = smtp();
  if (!t) {
    if (process.env.MF_MEMORIA) { // teste local: grava em /tmp em vez de enviar
      const arq = `/tmp/mf-email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
      fs.writeFileSync(arq, JSON.stringify({ ...msg, attachments: (msg.attachments || []).map(a => a.filename) }, null, 1));
      return { messageId: "teste:" + arq };
    }
    throw new Error("SMTP não configurado (SMTP_USER/SMTP_PASS).");
  }
  const r = await t.sendMail({ from: remetente(), ...msg });
  return { messageId: r.messageId };
}

const moldura = corpo => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#0E2A3B;max-width:560px">${corpo}<p style="margin-top:28px;font-size:13px;color:#4F6473">Mapeando Futuros · Metodologia desenvolvida por Celso Junqueira</p></div>`;

export async function enviarMapaCliente(p, pdf) {
  const primeiro = String(p.nome).trim().split(/\s+/)[0];
  const destinatario = p.menor && p.resp_nome ? String(p.resp_nome).split(/\s+/)[0] : primeiro;
  const sobre = p.menor ? ` de ${esc(primeiro)}` : "";
  return enviar({
    to: p.email,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    subject: "Seu Mapa de Potenciais e Caminhos",
    text: `Olá, ${destinatario}.\n\nO Mapa de Potenciais e Caminhos${p.menor ? " de " + primeiro : ""} está anexado a este e-mail em PDF.\n\nSugestão para a leitura: escolha uma situação concreta da sua vida e acompanhe-a ao longo do Mapa. No final, use o quadro para registrar o que experimentar.\n\nSe tiver qualquer dúvida, basta responder a esta mensagem.\n\nMapeando Futuros`,
    html: moldura(`<p>Olá, ${esc(destinatario)}.</p><p>O <b>Mapa de Potenciais e Caminhos</b>${sobre} está anexado a este e-mail em PDF.</p><p>Sugestão para a leitura: escolha uma situação concreta da sua vida e acompanhe-a ao longo do Mapa. No final, use o quadro para registrar o que experimentar.</p><p>Se tiver qualquer dúvida, basta responder a esta mensagem.</p>`),
    attachments: [{ filename: `Mapa de Potenciais e Caminhos - ${primeiro}.pdf`, content: pdf, contentType: "application/pdf" }]
  });
}

function fichaTecnica(p) {
  const r = p.revisao || {};
  const c = r.calculo || {};
  const linhas = Object.entries({
    "Foco": p.foco === "vocacional" ? "Vocacional" : "Caminho da Retomada",
    "Nome confirmado": p.nome, "Nascimento": p.dataNascimento, "Envio para": p.email + (p.menor ? ` (responsável: ${p.resp_nome})` : ""),
    "Nome por parte": c.nomePorParte, "Nome completo": c.nomeTotal, "Vogais": c.vogais, "Consoantes": c.consoantes,
    "Data": c.data, "Mês, dia, ano": c.smSdSa, "D1, D2, D3, D4": c.d1d2d3d4, "Planos": c.planos, "Ano Pessoal": c.anoPessoal, "Nome e data coincidem": c.coincidencia,
    "Redação com IA": p.redacaoIA || "não"
  }).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#4F6473;vertical-align:top">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("");
  const textos = (r.textos || []).map(t => `<li>${esc(t.grupo)} ${esc(t.chave)} — ${t.origem === "CELSO" ? "texto do Celso" : t.origem === "ADAPTADO" ? "adaptado" : "<b>" + esc(t.origem) + "</b>"}</li>`).join("");
  const alertas = (r.alertas || []).map(a => `<li style="color:#B3261E">${esc(a)}</li>`).join("");
  return `
      ${p.relato ? `<p style="background:#F3F0EA;padding:12px 14px;border-radius:8px"><b>O que a pessoa contou:</b><br>${esc(p.relato)}</p>` : ""}
      ${alertas ? `<p><b>Atenção:</b></p><ul>${alertas}</ul>` : ""}
      <p style="margin-top:24px"><b>Conferência técnica</b> (não aparece para o cliente)</p>
      <table style="font-size:14px;border-collapse:collapse">${linhas}</table>
      <p style="margin-top:16px;font-size:14px"><b>Textos usados</b></p><ul style="font-size:14px">${textos}</ul>`;
}
const copiaPara = () => process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL !== process.env.REVISOR_EMAIL ? process.env.ADMIN_EMAIL : undefined;

export async function enviarParaRevisao(p, pdf, linkRevisao) {
  return enviar({
    to: process.env.REVISOR_EMAIL, cc: copiaPara(),
    subject: `Revisar Mapa ${p.orderId} · ${String(p.nome).split(/\s+/)[0]}`,
    html: moldura(`
      <p style="font-size:20px"><b>Novo Mapa para revisar</b></p>
      <p>O PDF está anexado. Leia com calma. Se estiver tudo certo, clique no botão azul abaixo. O Mapa será enviado ao cliente na mesma hora.</p>
      <p style="margin:28px 0"><a href="${esc(linkRevisao)}" style="background:#1F6E9C;color:#fff;padding:16px 28px;border-radius:10px;text-decoration:none;font-size:18px;font-weight:bold;display:inline-block">Abrir e aprovar o envio</a></p>
      <p>Se precisar mudar alguma coisa, <b>não clique no botão</b>. Responda a este e-mail dizendo o que mudar.</p>
      ${fichaTecnica(p)}`),
    attachments: [{ filename: `REVISAR ${p.orderId}.pdf`, content: pdf, contentType: "application/pdf" }]
  });
}

/** Entrega automática: cópia do Mapa já enviado, para Celso acompanhar. Não pede nenhuma ação. */
export async function enviarCopiaAcompanhamento(p, pdf) {
  return enviar({
    to: process.env.REVISOR_EMAIL, cc: copiaPara(),
    subject: `Mapa enviado ${p.orderId} · ${String(p.nome).split(/\s+/)[0]}`,
    html: moldura(`
      <p style="font-size:20px"><b>Um Mapa foi enviado ao cliente</b></p>
      <p>Esta é só uma cópia para você acompanhar. <b>Não é preciso fazer nada.</b> O cliente já recebeu o PDF anexado em <b>${esc(p.email)}</b>.</p>
      <p>Se notar algum problema no texto, responda a este e-mail dizendo o que corrigir.</p>
      ${fichaTecnica(p)}`),
    attachments: [{ filename: `ENVIADO ${p.orderId}.pdf`, content: pdf, contentType: "application/pdf" }]
  });
}

export async function enviarAlerta(assunto, texto) {
  const para = process.env.ADMIN_EMAIL || process.env.REVISOR_EMAIL;
  if (!para) return;
  try { await enviar({ to: para, subject: `[Mapeando Futuros] ${assunto}`, text: texto }); } catch (e) { console.error("alerta não enviado", e.message); }
}

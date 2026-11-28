// Desenha a Análise Integrada em PDF (A4), no padrão visual do PDF de referência.
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// As fontes ficam em /fonts na raiz do projeto (incluídas no pacote das funções pelo netlify.toml).
function fonte(arquivo) {
  const raizes = [path.join(DIR, "..", "fonts"), path.join(process.cwd(), "fonts"), process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, "fonts"), "/var/task/fonts"].filter(Boolean);
  for (const base of raizes) {
    const p = path.join(base, arquivo);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Fonte não encontrada: ${arquivo}`);
}

const COR = { tinta: "#0E2A3B", azul: "#1F6E9C", azulClaro: "#E4F2FB", verde: "#1E7466", suave: "#4F6473", linha: "#D5E3EC", trilho: "#E8EEF2" };
const A4 = { w: 595.28, h: 841.89 };
const M = { top: 78, bottom: 70, left: 58, right: 58 };
const LARG = A4.w - M.left - M.right;

export function gerarPdf({ doc: secoes, nomeExibicao, pedido = "", versao = "1.0", exemplo = false }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margins: M, bufferPages: true, info: {
      Title: `Mapa de Potenciais e Caminhos — ${nomeExibicao}`, Author: "Mapeando Futuros", Subject: "Análise Integrada", Creator: "Mapeando Futuros"
    } });
    const partes = [];
    pdf.on("data", c => partes.push(c));
    pdf.on("end", () => resolve(Buffer.concat(partes)));
    pdf.on("error", reject);

    pdf.registerFont("titulo", fonte("sora-latin-400-normal.woff"));
    pdf.registerFont("tituloF", fonte("sora-latin-600-normal.woff"));
    pdf.registerFont("corpo", fonte("manrope-latin-400-normal.woff"));
    pdf.registerFont("corpoM", fonte("manrope-latin-600-normal.woff"));
    pdf.registerFont("corpoB", fonte("manrope-latin-700-normal.woff"));

    // Guarda fonte, corpo e cor atuais: o cabeçalho é desenhado no meio de um parágrafo que quebra de página.
    const fontOrig = pdf.font.bind(pdf), corOrig = pdf.fillColor.bind(pdf);
    let fonteAtual = "corpo", corAtual = COR.tinta;
    pdf.font = (n, ...r) => { if (typeof n === "string") fonteAtual = n; return fontOrig(n, ...r); };
    pdf.fillColor = (c, ...r) => { corAtual = c; return corOrig(c, ...r); };
    const cabecalho = () => {
      const y = 38, f = fonteAtual, tam = pdf._fontSize, c = corAtual;
      pdf.save();
      pdf.rect(M.left, y + 3, 16, 2).fill(COR.azul);
      pdf.font("corpoB").fontSize(7.5).fillColor(COR.azul).text("MAPEANDO FUTUROS", M.left + 22, y, { lineBreak: false, characterSpacing: 0.8 });
      pdf.font("corpo").fontSize(7.5).fillColor(COR.suave);
      const t = "ANÁLISE INTEGRADA";
      pdf.text(t, A4.w - M.right - pdf.widthOfString(t, { characterSpacing: 0.6 }), y, { lineBreak: false, characterSpacing: 0.6 });
      pdf.restore();
      pdf.font(f).fontSize(tam).fillColor(c);
      pdf.x = M.left; pdf.y = M.top;
    };
    pdf.on("pageAdded", cabecalho);
    cabecalho();

    const espaco = () => A4.h - M.bottom - pdf.y;
    const garantir = alt => { if (espaco() < alt) pdf.addPage(); };
    const topoDaPagina = () => pdf.y <= M.top + 1;

    const alturaTexto = (txt, font, size, opts = {}) => { pdf.font(font).fontSize(size); return pdf.heightOfString(txt, { width: LARG, lineGap: opts.lineGap ?? 3.2 }); };
    const P_FONT = ["corpo", 10.4], P_GAP = 3.4;

    const desenhar = {
      capa(b) {
        if (exemplo) {
          const t = "EXEMPLO FICTÍCIO", y = pdf.y + 4;
          pdf.font("corpoB").fontSize(8.5);
          const w = pdf.widthOfString(t, { characterSpacing: 1 }) + 24;
          pdf.roundedRect(M.left, y, w, 22, 11).fill(COR.azulClaro);
          pdf.fillColor(COR.azul).text(t, M.left + 12, y + 7, { lineBreak: false, characterSpacing: 1 });
          pdf.x = M.left; pdf.y = y + 22;
        }
        pdf.moveDown(1.2);
        pdf.font("titulo").fontSize(34).fillColor(COR.tinta).text(b.titulo, { width: LARG * 0.86, lineGap: 2 });
        pdf.moveDown(0.5);
        pdf.font("corpoB").fontSize(14).fillColor(COR.azul).text(b.subtitulo);
        pdf.moveDown(0.6);
        pdf.font("titulo").fontSize(17).fillColor(COR.tinta).text(b.nome, { width: LARG });
        pdf.moveDown(0.15);
        pdf.font("corpo").fontSize(9.5).fillColor(COR.suave).text(b.data);
        pdf.moveDown(1.6);
      },
      h1(b) {
        if (!topoDaPagina()) { garantir(260); pdf.moveDown(1.4); }
        pdf.font("titulo").fontSize(26).fillColor(COR.tinta).text(b.texto, { width: LARG, lineGap: 2 });
        pdf.moveDown(0.5);
      },
      h2(b, prox) {
        const alt = alturaTexto(b.texto, "corpoB", 13) + (prox?.texto ? Math.min(alturaTexto(prox.texto, ...P_FONT), 60) : 40) + 18;
        garantir(alt);
        if (!topoDaPagina()) pdf.moveDown(0.55);
        pdf.font("corpoB").fontSize(13).fillColor(COR.tinta).text(b.texto, { width: LARG });
        pdf.moveDown(0.35);
      },
      h3(b, prox) {
        const alt = alturaTexto(b.texto, "corpoB", 11) + (prox?.texto ? Math.min(alturaTexto(prox.texto, ...P_FONT), 50) : 30) + 12;
        garantir(alt);
        if (!topoDaPagina()) pdf.moveDown(0.35);
        pdf.font("corpoB").fontSize(11).fillColor(COR.azul).text(b.texto, { width: LARG });
        pdf.moveDown(0.25);
      },
      p(b) {
        garantir(Math.min(alturaTexto(b.texto, ...P_FONT, { lineGap: P_GAP }), 40));
        pdf.font(P_FONT[0]).fontSize(P_FONT[1]).fillColor(COR.tinta).text(b.texto, { width: LARG, lineGap: P_GAP, align: "left" });
        pdf.moveDown(0.6);
      },
      pLabel(b) {
        garantir(Math.min(alturaTexto(`${b.label} ${b.texto}`, ...P_FONT, { lineGap: P_GAP }), 40));
        pdf.font("corpoB").fontSize(P_FONT[1]).fillColor(COR.tinta).text(b.label + " ", { width: LARG, lineGap: P_GAP, continued: true })
          .font(P_FONT[0]).text(b.texto, { lineGap: P_GAP });
        pdf.moveDown(0.6);
      },
      bullets(b) {
        for (const item of b.itens) {
          garantir(30);
          const y = pdf.y;
          pdf.circle(M.left + 3, y + 6.5, 2.2).fill(COR.azul);
          pdf.font("corpoM").fontSize(10.8).fillColor(COR.tinta).text(item, M.left + 14, y, { width: LARG - 14, lineGap: 3 });
          pdf.x = M.left; pdf.moveDown(0.55);
        }
      },
      destaque(b) {
        pdf.moveDown(0.6);
        pdf.font("corpoB").fontSize(12.5);
        const pad = 20, h = pdf.heightOfString(b.texto, { width: LARG - pad * 2, lineGap: 4 }) + pad * 2;
        garantir(h + 10);
        const y = pdf.y;
        pdf.roundedRect(M.left, y, LARG, h, 10).fill(COR.azulClaro);
        pdf.rect(M.left, y + 12, 3, h - 24).fill(COR.azul);
        pdf.fillColor(COR.tinta).text(b.texto, M.left + pad, y + pad, { width: LARG - pad * 2, lineGap: 4 });
        pdf.x = M.left; pdf.y = y + h + 12;
      },
      quadro(b) {
        const hCab = 26, hLin = 52, h = hCab + hLin * b.linhas;
        garantir(h + 16);
        const y0 = pdf.y + 4, col = LARG / b.colunas.length;
        pdf.save();
        pdf.roundedRect(M.left, y0, LARG, hCab, 6).fill(COR.azulClaro);
        pdf.rect(M.left, y0 + hCab - 6, LARG, 6).fill(COR.azulClaro);
        pdf.font("corpoB").fontSize(9).fillColor(COR.azul);
        b.colunas.forEach((c, i) => pdf.text(c, M.left + i * col + 8, y0 + 9, { width: col - 16, lineBreak: false }));
        pdf.lineWidth(0.8).strokeColor(COR.linha);
        pdf.rect(M.left, y0, LARG, h).stroke();
        for (let i = 1; i < b.colunas.length; i++) pdf.moveTo(M.left + i * col, y0).lineTo(M.left + i * col, y0 + h).stroke();
        for (let r = 0; r < b.linhas; r++) pdf.moveTo(M.left, y0 + hCab + r * hLin).lineTo(M.left + LARG, y0 + hCab + r * hLin).stroke();
        pdf.restore();
        pdf.x = M.left; pdf.y = y0 + h + 18;
      },
      grafico(b) {
        // Uma única imagem: quatro barras finas em azul, escala real de 0 a 100%,
        // nome do plano acima da barra e percentual ao lado. Cerca de 1/3 da página, junto da nota.
        const hBloco = 30, altura = 14 + b.planos.length * hBloco + 20;
        if (process.env.DEBUG_PDF) console.error("grafico y", pdf.y, "espaco", espaco(), "altura", altura);
        garantir(altura);
        const x0 = M.left, larg = LARG - 46;
        let y = pdf.y + 4;
        pdf.save();
        // marcas da escala
        pdf.font("corpo").fontSize(7).fillColor(COR.suave);
        [0, 25, 50, 75, 100].forEach(p => {
          const x = x0 + larg * p / 100;
          pdf.text(`${p}%`, x - 12, y, { width: 24, align: "center", lineBreak: false });
        });
        y += 12;
        const topoBarras = y;
        const fimBarras = y + b.planos.length * hBloco - 8;
        pdf.lineWidth(0.6).strokeColor(COR.linha).dash(2, { space: 3 });
        [25, 50, 75, 100].forEach(p => { const x = x0 + larg * p / 100; pdf.moveTo(x, topoBarras).lineTo(x, fimBarras).stroke(); });
        pdf.undash();
        for (const pl of b.planos) {
          pdf.font("corpoB").fontSize(9.5).fillColor(COR.tinta).text(pl.nome, x0, y, { lineBreak: false });
          const yb = y + 14;
          pdf.roundedRect(x0, yb, larg, 7, 3.5).fill(COR.trilho);
          const w = Math.max(larg * pl.fracao, 3);
          pdf.roundedRect(x0, yb, w, 7, 3.5).fill(COR.azul);
          pdf.font("corpoM").fontSize(9.5).fillColor(COR.azul).text(`${pl.percentual}%`, x0 + w + 8, yb - 2.5, { lineBreak: false });
          y += hBloco;
        }
        pdf.restore();
        pdf.font("corpo").fontSize(8.2).fillColor(COR.suave).text(b.nota, M.left, y + 2, { width: LARG });
        pdf.x = M.left; pdf.moveDown(0.8);
      }
    };

    secoes.forEach((s, i) => {
      if (s.novaPagina && i > 0 && !topoDaPagina()) pdf.addPage();
      s.blocos.forEach((b, j) => desenhar[b.t](b, s.blocos[j + 1]));
    });

    // Rodapés com número de página
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const mb = pdf.page.margins.bottom; pdf.page.margins.bottom = 0;
      const y = A4.h - 44;
      pdf.lineWidth(0.6).strokeColor(COR.linha).moveTo(M.left, y - 8).lineTo(A4.w - M.right, y - 8).stroke();
      pdf.font("corpo").fontSize(7.5).fillColor(COR.suave);
      const esq = i === range.start + range.count - 1
        ? `Mapa de Potenciais e Caminhos · Metodologia desenvolvida por Celso Junqueira · Versão ${versao}${pedido ? " · " + pedido : ""}`
        : (exemplo ? "Exemplo fictício · Mapa de Potenciais e Caminhos" : "Mapa de Potenciais e Caminhos");
      pdf.text(esq, M.left, y, { lineBreak: false });
      const n = String(i + 1);
      pdf.text(n, A4.w - M.right - pdf.widthOfString(n), y, { lineBreak: false });
      pdf.page.margins.bottom = mb;
    }
    pdf.end();
  });
}

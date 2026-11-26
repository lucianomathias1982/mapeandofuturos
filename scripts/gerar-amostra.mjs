// Gera um PDF de amostra localmente, sem pagamento nem e-mail.
// Uso: node scripts/gerar-amostra.mjs "Nome Completo" DD/MM/AAAA vocacional|retomada [DD/MM/AAAA-da-geração] [saida.pdf]
import fs from "node:fs";
import { montarAnalise, conferirTermos } from "../lib/analise.mjs";
import { gerarPdf } from "../lib/pdf.mjs";
import { parseData } from "../lib/calc.mjs";

const [nome = "Luciano Mathias Pereira de Andrade Junqueira", nasc = "02/08/1982", foco = "vocacional", geracao, saida] = process.argv.slice(2);
const hoje = geracao ? (({ dia, mes, ano }) => ({ dia, mes, ano }))(parseData(geracao, { dia: 31, mes: 12, ano: 9999 })) : undefined;
const a = montarAnalise({ nome, dataNascimento: nasc, foco, hoje });
const termos = conferirTermos(a.doc);
if (termos.length) { console.error("Termos proibidos:", termos); process.exit(1); }
const buf = await gerarPdf({ doc: a.doc, nomeExibicao: a.nomeExibicao, pedido: "AMOSTRA" });
const arq = saida || `amostra-${foco}.pdf`;
fs.writeFileSync(arq, buf);
console.log(JSON.stringify(a.revisao.calculo, null, 1));
console.log(a.revisao.textos.map(t => `${t.grupo} ${t.chave}: ${t.origem}`).join("\n"));
console.log(`→ ${arq} (${(buf.length / 1024).toFixed(0)} KB)`);

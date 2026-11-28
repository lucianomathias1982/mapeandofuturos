// Testes do motor de cálculo — caso de conferência da Especificação 1.0 e casos-limite.
// Rodar: node scripts/teste-calculo.mjs
import assert from "node:assert/strict";
import { calcularTudo, parseData, validarNome, orientacaoMomento } from "../lib/calc.mjs";

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const nov2026 = { dia: 26, mes: 11, ano: 2026 };

// ---- Caso de conferência: Luciano ----
const L = calcularTudo({ nome: "Luciano Mathias Pereira de Andrade Junqueira", dataNascimento: "02/08/1982", hoje: nov2026 });
t("Nome por parte 30, 26, 45, 9, 29, 44", () => assert.deepEqual(L.nome.partes.map(p => p.bruto), [30, 26, 45, 9, 29, 44]));
t("Nome completo 183 → 12 → 3 (P03)", () => { assert.deepEqual(L.nome.cadeia, [183, 12, 3]); assert.equal(L.nome.perfil, 3); });
t("Vogais 83 → 11 → 2", () => assert.deepEqual(L.nome.vogais.cadeia, [83, 11, 2]));
t("Consoantes 100 → 1", () => assert.deepEqual(L.nome.consoantes.cadeia, [100, 1]));
t("Data 30 → 3, variação 30", () => { assert.equal(L.data.bruto, 30); assert.equal(L.data.perfil, 3); assert.equal(L.data.variacao, 30); });
t("Mês, dia e ano reduzidos 8, 2, 2", () => assert.deepEqual([L.data.SM, L.data.SD, L.data.SA], [8, 2, 2]));
t("D1..D4 = 6, 0, 6, 6 → apenas o 6, uma vez, como principal", () => {
  assert.deepEqual([L.data.D1, L.data.D2, L.data.D3, L.data.D4], [6, 0, 6, 6]);
  assert.deepEqual(L.data.aspectos.map(a => [a.valor, a.principal]), [[6, true]]);
});
t("Planos 11, 12, 7, 9 de 39 → 28%, 31%, 18%, 23%", () => {
  const p = L.nome.planos;
  assert.equal(L.nome.totalLetras, 39);
  assert.deepEqual([p.mental, p.fisico, p.emocional, p.intuitivo].map(x => x.quantidade), [11, 12, 7, 9]);
  assert.deepEqual([p.mental, p.fisico, p.emocional, p.intuitivo].map(x => x.percentual), [28, 31, 18, 23]);
});
t("Ano Pessoal em nov/2026: 2026 = 20 → 2; 2027 = 21 → 3", () => {
  assert.equal(L.momento.tipo, "passagem");
  assert.deepEqual([L.momento.retro.ano, L.momento.retro.bruto, L.momento.retro.valor], [2026, 20, 2]);
  assert.deepEqual([L.momento.prioridade.ano, L.momento.prioridade.bruto, L.momento.prioridade.valor], [2027, 21, 3]);
});
t("Nome e data coincidem no perfil 3", () => assert.equal(L.coincidencia, true));

// ---- Casos-limite pedidos na especificação ----
t("Partículas: DA 5, DE 9, DO 10 → 1, DOS 11, DAS 6, todas no total", () => {
  const r = calcularTudo({ nome: "Ana da de do dos das Luz", dataNascimento: "01/01/2000", hoje: nov2026 });
  assert.deepEqual(r.nome.partes.slice(1, 6).map(p => [p.bruto, p.reduzido]), [[5, 5], [9, 9], [10, 1], [11, 11], [6, 6]]);
  assert.equal(r.nome.bruto, r.nome.partes.reduce((s, p) => s + p.bruto, 0));
});
t("Acentos, cedilha, hífen e apóstrofo", () => {
  const a = calcularTudo({ nome: "JOÃO D'ÁVILA-ÇARÃO", dataNascimento: "01/01/2000", hoje: nov2026 });
  const b = calcularTudo({ nome: "Joao Davila Carao", dataNascimento: "01/01/2000", hoje: nov2026 });
  assert.equal(a.nome.bruto, b.nome.bruto);
});
t("Mestre em vogais reduz a um dígito; nome sem consoantes gera alerta", () => {
  const r = calcularTudo({ nome: "Ii Aaaa", dataNascimento: "01/01/2000", hoje: nov2026 }); // 9+9+1+1+1+1 = 22 → 4
  assert.equal(r.nome.vogais.bruto, 22); assert.equal(r.nome.vogais.valor, 4);
  assert.ok(r.nome.consoantes.ausente); assert.equal(r.alertas.length, 1);
});
t("Perfil do nome para em 11, 22, 33 e 44", () => {
  const perfil = n => calcularTudo({ nome: n, dataNascimento: "01/01/2000", hoje: nov2026 }).nome;
  assert.deepEqual(perfil("Ivo Ai").cadeia, [29, 11]);          // 19 + 10
  assert.deepEqual(perfil("Ana Lia Sa").cadeia, [22]);          // 7 + 13 + 2
  assert.deepEqual(perfil("Ivo Iva").cadeia, [33]);             // 19 + 14
  assert.deepEqual(perfil("Ana Lia Sa Ana Lia Sa").cadeia, [44]);
  assert.deepEqual(perfil("Ana Ivo").cadeia, [26, 8]);          // 7 + 19
});
t("Variação do nome pelo total bruto (37 → P01 + variação 37)", () => {
  const r = calcularTudo({ nome: "Ivo Ana Sa", dataNascimento: "01/01/2000", hoje: nov2026 }); // 19 + 7 + 2 = 28 → 10 → 1
  assert.equal(r.nome.bruto, 28); assert.equal(r.nome.perfil, 1); assert.equal(r.nome.variacao, 28);
});
t("Zero como aspecto principal (D3 = 0)", () => {
  const r = calcularTudo({ nome: "Ana Luz", dataNascimento: "03/05/1990", hoje: nov2026 }); // SM5 SD3 SA1 → 2,2,0,4
  assert.deepEqual([r.data.D1, r.data.D2, r.data.D3, r.data.D4], [2, 2, 0, 4]);
  assert.deepEqual(r.data.aspectos.map(a => a.valor), [0, 2, 4]);
  assert.equal(r.data.aspectos[0].principal, true);
});
t("Sem repetição em D1 a D4 (quatro aspectos)", () => {
  const r = calcularTudo({ nome: "Ana Luz", dataNascimento: "02/09/1990", hoje: nov2026 }); // SM9 SD2 SA1 → 7,1,6,8
  assert.deepEqual(r.data.aspectos.map(a => a.valor), [6, 7, 1, 8]);
});
t("Zero secundário é ignorado", () => {
  const r = calcularTudo({ nome: "Ana Luz", dataNascimento: "05/05/1990", hoje: nov2026 }); // SM5 SD5 SA1 → 0,4,4,4
  assert.deepEqual(r.data.aspectos.map(a => a.valor), [4]);
});
t("Geração em 31/12 e em 01/01", () => {
  const nasc = { dia: 2, mes: 8, ano: 1982 };
  const a = orientacaoMomento(nasc, { dia: 31, mes: 12, ano: 2026 });
  assert.equal(a.tipo, "passagem"); assert.equal(a.retro.ano, 2026); assert.equal(a.prioridade.ano, 2027);
  const b = orientacaoMomento(nasc, { dia: 1, mes: 1, ano: 2027 });
  assert.equal(b.tipo, "momento"); assert.equal(b.prioridade.ano, 2027); assert.equal(b.prioridade.valor, 3);
  const c = orientacaoMomento(nasc, { dia: 10, mes: 1, ano: 2027 }, { retroJaneiroAteDia: 15 });
  assert.equal(c.tipo, "passagem"); assert.equal(c.retro.ano, 2026);
  const d = orientacaoMomento(nasc, { dia: 15, mes: 6, ano: 2027 });
  assert.equal(d.tipo, "momento");
});
t("Validação de data: inexistente, futura, formato", () => {
  assert.ok(parseData("31/02/2000", nov2026).erro);
  assert.ok(parseData("27/11/2026", nov2026).erro);
  assert.ok(!parseData("26/11/2026", nov2026).erro);
  assert.ok(parseData("2/8/1982", nov2026).erro);
  assert.ok(!parseData("29/02/2000", nov2026).erro);
  assert.ok(parseData("29/02/1900", nov2026).erro);
});
t("Validação de nome", () => {
  assert.ok(validarNome("Luciano"));
  assert.ok(validarNome("Luciano 2 Silva"));
  assert.equal(validarNome("  Ñandú  Pérez  "), null);
});

console.log(`\n${ok} verificações aprovadas.`);

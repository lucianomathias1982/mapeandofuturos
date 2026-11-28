# Mapeando Futuros — site e geração do Mapa

Implantação da **Especificação 1.0** (CJ – Mapeando Futuros). Metodologia desenvolvida por Celso Junqueira.

## Como funciona, do começo ao fim

1. A pessoa escolhe o foco (Vocacional ou Caminho da Retomada) e clica em **Mapear meu futuro**.
2. Informa o **nome completo de registro**, a **data de nascimento** (DD/MM/AAAA), o e-mail de entrega e, se quiser, um relato sobre o momento. Menores de 18 anos são identificados pela data e o responsável preenche.
3. Confere nome, data e e-mail na tela de conferência e vai para o pagamento na Stripe (R$ 230,00).
4. A Stripe confirma o pagamento → o site calcula, monta e gera o PDF do pedido.
5. **Entrega automática** (padrão): o cliente recebe o PDF no e-mail confirmado, e Celso recebe uma cópia com a conferência técnica, só para acompanhar.
6. **Revisão prévia** (opcional, `REVISAO_MANUAL=sim`): cada Mapa espera Celso clicar em **Aprovar e enviar ao cliente** antes de sair.

Cada pedido guarda a versão da análise e todos os estados (`aguardando_pagamento → pago → gerando → em_revisao → aprovado → entregando → entregue`). Confirmações repetidas da Stripe, cliques repetidos e falhas temporárias não duplicam o pedido. A cada 30 minutos uma rotina retoma o que parou no meio (até 5 tentativas; depois disso chega um alerta por e-mail).

## Configuração na Netlify — passo a passo

Netlify › seu site › **Site configuration › Environment variables** › *Add a variable*. Crie uma por uma:

| Variável | O que colocar |
|---|---|
| `STRIPE_SECRET_KEY` | Chave secreta da Stripe (`sk_test_…` para teste; `sk_live_…` para produção) |
| `PRICE_VOCACIONAL` / `PRICE_RETOMADA` | Price IDs dos dois produtos na Stripe (`price_…`) |
| `STRIPE_WEBHOOK_SECRET` | Segredo do webhook (`whsec_…`) — veja o passo da Stripe abaixo |
| `SITE_URL` | `https://mapeandofuturos.com` (sem barra no final) |
| `SMTP_USER` | E-mail que envia os Mapas, ex.: `contato@mapeandofuturos.com` |
| `SMTP_PASS` | Senha desse e-mail na Locaweb |
| `SMTP_HOST` / `SMTP_PORT` | Opcional. Padrão: `email-ssl.com.br` e `465` (Locaweb) |
| `MAIL_FROM` | Opcional. Ex.: `Mapeando Futuros <contato@mapeandofuturos.com>` |
| `REVISOR_EMAIL` | E-mail de Celso (recebe uma cópia de cada Mapa enviado; no modo de revisão prévia, recebe para aprovar) |
| `ADMIN_EMAIL` | Seu e-mail (cópia das revisões e alertas de falha) |
| `ADMIN_TOKEN` | Uma senha longa e aleatória, só sua (mínimo 16 caracteres). Protege o painel e os links |
| `REVISAO_MANUAL` | Opcional. Padrão: entrega automática. `sim` faz cada Mapa esperar a aprovação de Celso |
| `ANTHROPIC_API_KEY` | Opcional. Só é usada quando o cliente escreve um relato: a IA reescreve os trechos de integração para aproveitá-lo (o cálculo e a escolha dos textos nunca passam pela IA). Sem a chave, o Mapa sai com os textos padrão e o relato só aparece na cópia de Celso. Na entrega automática, esse texto chega ao cliente sem revisão prévia |
| `RETRO_JANEIRO_ATE_DIA` | Opcional. Até que dia de janeiro aparece a retrospectiva do ano anterior. Padrão `0` (não aparece) — **a confirmar com Celso** |

Depois de salvar as variáveis: **Deploys › Trigger deploy › Deploy site**.

**Stripe › Developers › Webhooks › Add endpoint**
- URL: `https://mapeandofuturos.com/.netlify/functions/stripe-webhook`
- Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- Copie o *Signing secret* (`whsec_…`) para `STRIPE_WEBHOOK_SECRET`.

## Testar antes de abrir as vendas (exigido pela especificação)

1. Com as chaves de **teste** da Stripe, faça um pedido completo em **cada foco** (cartão `4242 4242 4242 4242`, qualquer data futura, qualquer CVC).
2. Confira: tela de conferência → pagamento → e-mail do cliente → cópia para Celso → abrir o PDF.
3. Repita a confirmação de pagamento: Stripe › Webhooks › o evento › **Resend**. O pedido não pode duplicar.
4. Gere amostras sem pagar (troque `SEU_TOKEN`):
   `https://mapeandofuturos.com/.netlify/functions/admin?token=SEU_TOKEN&acao=amostra&nome=Luciano Mathias Pereira de Andrade Junqueira&data=02/08/1982&foco=vocacional&geracao=26/11/2026`
   Acrescente `&formato=json` para ver só a conferência técnica.

## Painel do administrador

`https://mapeandofuturos.com/.netlify/functions/admin?token=SEU_TOKEN&acao=…`
- `lista` — pedidos e situação
- `status&pedido=MF-…` — detalhes (inclui o link de revisão, se estiver aguardando)
- `reprocessar&pedido=MF-…` — tenta de novo geração/entrega que esgotou as tentativas
- `reenviar&pedido=MF-…` — reenvia ao cliente um Mapa já entregue

## Para desenvolvedores

- `lib/calc.mjs` — motor de cálculo (regras da Especificação 1.0)
- `lib/textos.mjs` — banco de textos; cada grupo indica a origem: `[CELSO]`, `[ADAPTADO]`, `[PROPOSTA]`
- `lib/analise.mjs` — seleção e montagem das seções; `lib/pdf.mjs` — PDF (PDFKit, fontes Sora/Manrope em `fonts/`)
- `lib/processar.mjs` — estados, idempotência e retentativas; `lib/email.mjs` — SMTP
- `npm run teste` — caso de conferência, casos-limite e fluxo completo sem rede
- `npm run amostra -- "Nome Completo" DD/MM/AAAA vocacional|retomada [DD/MM/AAAA-da-geração] [saida.pdf]`
- Exemplo fictício do botão “Ver exemplo de Mapa” (refazer quando os textos mudarem):
  `EXEMPLO=1 node scripts/gerar-amostra.mjs "Mário Vinícius Ribeiro Prado" 07/03/2009 vocacional 15/06/2026 exemplo/mapa-de-potenciais-exemplo.pdf`

## Pendências de conteúdo (com Celso)

- **Variações da data 19, 25, 37 e 43**: cadastradas na especificação, mas a redação não veio. Até chegar, essas somas usam só o texto-base.
- **Consoantes 2**: o texto recebido repete o de vogais 2. Há uma proposta no lugar, a substituir pelo original.
- **Textos marcados `[PROPOSTA]`** (apresentação, combinação, vida pessoal e profissional, Planos, “Experimente”, variação 46): redigidos para os primeiros testes. Com a entrega automática, chegam ao cliente sem revisão: Celso precisa aprová-los antes de abrir as vendas.
- **Variações do nome pelo total bruto**: como a especificação manda usar o total bruto, e nomes completos somam quase sempre mais de 100, as seis variações (13–46) quase nunca serão acionadas. Confirmar com Celso se a chave deveria ser o primeiro total de dois dígitos.
- **Zero em posição secundária**: a especificação manda ignorar; o texto “Escolher conforme a situação” (Bloco III) ficou cadastrado, fora de uso.
- **IAP (12 itens)**: não implantado; aguarda a redação dos itens e o modo de aplicação.
- **Retrospectiva em janeiro** e **convenção de normalização** (Y como consoante, remoção de acentos): a confirmar.
- **Preço**: definido em R$ 230,00. O site mostra R$ 230,00 (`CONFIG.prices` no `index.html`); os preços cadastrados na Stripe e as variáveis `PRICE_VOCACIONAL` e `PRICE_RETOMADA` precisam apontar para preços de R$ 230,00. Qualquer mudança futura: Stripe e `CONFIG.prices` ao mesmo tempo.

# Mapeando Futuros — site

1. Suba esta pasta em um site novo da Netlify (conecte um repositório GitHub ou arraste a pasta).
2. Na Stripe: crie dois produtos ("Mapa — Vocacional" R$ 240 e "Mapa — Caminho da Retomada" R$ 240) e copie os Price IDs.
3. Em Netlify › Site configuration › Environment variables, crie:
   STRIPE_SECRET_KEY, PRICE_VOCACIONAL, PRICE_RETOMADA, SITE_URL (ex.: https://seudominio.com.br),
   STRIPE_WEBHOOK_SECRET, AUTOMATION_WEBHOOK_URL
4. Na Stripe › Webhooks, aponte para https://SEU-SITE/.netlify/functions/stripe-webhook com os eventos
   checkout.session.completed e checkout.session.async_payment_succeeded.
5. Em index.html, preencha CONFIG.checkoutEndpoint = "/.netlify/functions/create-checkout" e o e-mail de contato.
6. Teste com as chaves de teste da Stripe (cartão 4242 4242 4242 4242) antes de trocar para as chaves live.
Imagens: substitua os arquivos em assets/ (hero.jpg, vocacional.jpg, retomada.jpg, mapa.jpg).

# AGENTS.md

## Projeto
Matos, Gestão de Aluguéis

## Regra obrigatória de trabalho
Toda tarefa de desenvolvimento — correção, melhoria, refatoração, ajuste visual ou nova funcionalidade — deve ser rastreada no GitHub e seguir o fluxo abaixo.

### 1. Criar uma Issue antes de alterar código
A Issue deve conter, sempre que aplicável:
- contexto do problema ou objetivo;
- escopo da tarefa;
- critérios de aceite;
- riscos relevantes;
- observações de validação.

Nenhum agente deve iniciar uma alteração funcional diretamente na `main` sem uma Issue correspondente, salvo emergência explicitamente autorizada pelo responsável do projeto.

### 2. Criar uma branch específica para a Issue
A branch deve partir da `main` atualizada e ter nome claro, preferencialmente contendo o número da Issue.

Exemplos:
- `issue-12-corrigir-login`
- `issue-27-melhorar-cobrancas`
- `issue-31-relatorio-mensal`

Todas as alterações da tarefa devem ficar nessa branch até a validação.

### 3. Implementar e testar na branch
Antes de abrir o Pull Request:
- limitar a mudança ao escopo da Issue;
- evitar alterações não relacionadas;
- preservar dados e funcionalidades existentes;
- validar desktop e mobile quando houver interface;
- validar integrações afetadas, como Supabase, Vercel, Firebase ou APIs;
- não expor segredos, chaves privadas ou credenciais no código ou no GitHub.

### 4. Abrir Pull Request para `main`
Toda alteração funcional deve chegar à `main` por Pull Request.

A descrição do PR deve incluir:
- resumo do que foi alterado;
- como validar/testar;
- riscos ou pontos de atenção;
- referência explícita à Issue.

Quando o PR concluir integralmente a tarefa, usar:

`Closes #<numero-da-issue>`

Quando o PR apenas contribuir para a tarefa sem encerrá-la, usar:

`Refs #<numero-da-issue>`

### 5. Gerenciar deploys por PR
- Pull Requests devem ser usados para gerar/acompanhar Preview Deploys na Vercel quando disponíveis.
- Validar o Preview Deploy antes do merge, especialmente para mudanças visuais, autenticação, formulários, pagamentos, PDF, notificações e integrações.
- Produção deve acompanhar a branch `main`.
- Evitar deploy funcional direto em produção fora do fluxo de PR.

### 6. Gates obrigatórios de qualidade
O repositório possui uma esteira automatizada e agentes futuros devem preservá-la.

Antes do merge, sempre que aplicável, executar e/ou aguardar no GitHub Actions:
- **Biome** para lint e consistência do código novo/modernizado;
- **Arch Contract** (`npm run arch:check`) para invariantes arquiteturais e proteção contra secrets versionados;
- **Vitest** para testes unitários e de integração;
- **Codecov** para relatório de cobertura;
- **Knip** para dependências/unlisted desnecessários;
- **Playwright** para testes end-to-end em desktop e mobile;
- **Commitlint** para mensagens de commit convencionais;
- **Stryker** para mutation testing em mudanças de lógica crítica ou quando explicitamente necessário.

Não remover ou enfraquecer esses gates apenas para fazer um PR passar. Quando um gate acusar falso positivo no código legado, ajustar o escopo/configuração de forma documentada, preservando a capacidade de detectar regressões no código novo.

### 7. Observabilidade
A aplicação deve manter uma camada vendor-neutral de observabilidade baseada em conceitos OpenTelemetry/OTLP e adaptadores opcionais para Sentry, Datadog e New Relic.

Regras:
- nenhuma integração comercial deve ser ativada sem configuração explícita;
- DSNs, client tokens, license keys, API keys e headers OTLP sensíveis devem ficar somente em secrets/variáveis de ambiente;
- erros globais e rejeições não tratadas devem permanecer observáveis;
- dados sensíveis devem ser redigidos antes de qualquer envio de telemetria;
- instrumentação não deve impedir o carregamento da aplicação se o provedor estiver indisponível.

### 8. Merge somente após validação
Antes do merge, confirmar:
- critérios de aceite atendidos;
- ausência de regressões conhecidas;
- Preview Deploy validado quando aplicável;
- checks de qualidade/testes relevantes aprovados;
- PR referenciando a Issue correta.

Após o merge:
- confirmar o deploy de produção;
- verificar rapidamente a funcionalidade afetada;
- manter a Issue aberta se ainda houver pendências.

## Regra para qualquer agente ou modelo de IA
Qualquer agente, assistente ou modelo que editar este repositório deve ler e seguir este arquivo antes de alterar código.

O fluxo padrão é sempre:

**Issue → branch → implementação → testes → Pull Request mencionando a Issue → Preview Deploy → validação → merge na `main` → produção**

Se uma solicitação do usuário envolver uma nova correção, melhoria ou função, o agente deve criar a Issue correspondente antes de implementar.

## Segurança e restauração
Para mudanças de maior risco — autenticação, banco de dados, políticas RLS, pagamentos/PIX, notificações, migrações ou alterações estruturais — considerar ponto de restauração/backup antes da implementação e descrever o risco na Issue/PR.

Nunca armazenar no repositório:
- service account privada;
- tokens administrativos;
- senhas;
- secrets da Vercel/Supabase/Firebase;
- chaves privadas;
- DSN/token/licença privada de Sentry, Datadog, New Relic, Codecov ou OpenTelemetry Collector.

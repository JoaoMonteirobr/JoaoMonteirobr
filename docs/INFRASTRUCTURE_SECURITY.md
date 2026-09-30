# Segurança da infraestrutura

Este documento registra o modelo mínimo de segurança para Supabase, Vercel e GitHub Actions do
Matos, Gestão de Aluguéis.

## Fronteiras de confiança

- O navegador recebe somente chaves públicas e JWTs da própria sessão.
- A `service_role`, credenciais Firebase e tokens Meta existem apenas nos secrets das Edge Functions.
- Funções chamadas pelo navegador exigem JWT válido e autorização pelo perfil salvo em `perfis`.
- Funções internas exigem um segredo específico, não compartilhado com o frontend.
- O service worker armazena somente assets públicos da própria origem.

## Edge Functions versionadas

| Função | Chamada por | Proteção |
| --- | --- | --- |
| `admin-create-user` | administrador autenticado | JWT + perfil `admin` |
| `whatsapp-send` | administrador autenticado | JWT + perfil `admin` |
| `secure-login` | tela pública de login | limite por conta/IP e por IP |
| `push-dispatch` | cron interno | `PUSH_DISPATCH_SECRET` |

As dependências `npm:` usam versões exatas. `supabase/config.toml` registra quando o gateway deve
validar JWT e quando a função implementa autenticação própria.

## Preparação segura do push-dispatch

Antes de aplicar a migration ou publicar a nova função:

1. Gere um segredo aleatório de pelo menos 32 bytes fora do repositório.
2. Cadastre o mesmo valor como secret `PUSH_DISPATCH_SECRET` da Edge Function.
3. Cadastre o valor no Supabase Vault com o nome `push_dispatch_secret`.
4. Só então aplique a migration e publique `push-dispatch`.

Exemplo estrutural, sem valor real:

```sql
select vault.create_secret('<SEGREDO_GERADO_FORA_DO_REPOSITORIO>', 'push_dispatch_secret');
```

Nunca coloque o valor em migration, documentação, comentário, workflow ou variável do frontend.

## Ordem de rollout

1. Confirmar backup/restauração disponível no Supabase.
2. Configurar `PUSH_DISPATCH_SECRET` na função e no Vault.
3. Aplicar `harden_privileged_functions_and_push_dispatch`.
4. Publicar `push-dispatch`, `secure-login`, `admin-create-user` e `whatsapp-send`.
5. Validar chamadas sem credenciais (`401`) e chamadas administrativas válidas.
6. Validar o cron, a fila e o recebimento de uma notificação de teste.
7. Validar login válido, senha incorreta e bloqueio por origem/IP.
8. Verificar os advisors de segurança e desempenho do Supabase.

## Pendências do ambiente de produção

A revisão de 30/09/2026 encontrou avisos que não devem ser alterados fora do rollout aprovado:

- `Leaked Password Protection` ainda precisa ser habilitado no painel do Supabase Auth.
- Os avisos de funções `SECURITY DEFINER` anônimas são tratados pela migration deste PR; helpers usados
  por RLS e rotinas administrativas continuam disponíveis apenas para `authenticated`, com validação de
  identidade no corpo da função.
- Índices de chaves estrangeiras e otimizações de políticas RLS devem entrar em migration própria,
  depois de medir as consultas mais frequentes, para evitar uma alteração ampla sem evidência.

## Rollback

- Mantenha as versões anteriores das Edge Functions disponíveis no histórico do Supabase.
- Se o cron parar, desative temporariamente `matos_push_dispatch`; não torne o endpoint público.
- Reverter o frontend não reverte migrations. Para banco, produzir uma migration compensatória
  revisada em PR.
- Nunca usar `git reset`, edição direta da `main` ou alteração manual sem registro na Issue.

## GitHub e Vercel

- `sync-production.yml` apenas audita divergência; não baixa produção para a `main`.
- `vendor-pdf.yml` exige uma Issue, cria branch e abre PR.
- Actions, bibliotecas vendorizadas e pacotes npm são fixados por commit, checksum ou lockfile.
- Instalações de CI usam `npm ci` e um lockfile versionado.
- A `main` deve exigir PR, checks `quality`, `e2e` e `commitlint`, além de bloquear force-push e
  exclusão. Essa proteção depende de permissão administrativa no GitHub e deve ser confirmada após
  o merge deste PR.

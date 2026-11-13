---
name: letco
description: Registra no Letco (os planos em ~/planos) o trabalho feito nesta sessão do Claude, para ele aparecer no app. Use quando o usuário pedir "atualiza o Letco", "registra isso nos planos", "/letco", ou ao terminar um trabalho que ainda não está em nenhum plano.
argument-hint: "[o que registrar, ou o id do plano]"
---

# Letco: registrar esta sessão nos planos

O app Letco só mostra o que está escrito em `~/planos`. Esta skill leva para lá o que esta sessão fez, para o usuário ver o que andou sem ter de contar. Siga o formato da skill `planejamento`.

Pedido do usuário, se houver: $ARGUMENTS

## 1. Junte os fatos desta sessão

Só o que aconteceu de verdade nesta conversa e o que o git e o GitHub confirmam:
- o que foi feito, em 1 a 3 linhas, em palavras simples;
- repositório e pasta de trabalho (`git rev-parse --show-toplevel`, `git remote get-url origin`), branch (`git branch --show-current`) e commits desta sessão;
- PRs abertos ou mergeados (`gh pr view --json number,title,state,url` na branch, se houver);
- o que ficou pendente, o que depende do usuário e o que depende de outra pessoa.

Se a sessão foi só conversa, sem trabalho feito nem decisão tomada, diga isso em 1 linha e pare.

## 2. Ache o plano

1. Se `~/planos/projetos.yaml` não existir, diga "~/planos ainda não existe: abra o app Letco e faça a configuração" e pare.
2. Rode `~/.local/bin/planos ls` e procure o plano deste trabalho: o que o usuário indicou em $ARGUMENTS; senão o que cita o mesmo PR, a mesma branch ou o mesmo worktree (`grep -rl "<repo>#<n>\|<branch>" ~/planos/projetos/*/planos/*/plano.md`); senão um plano do mesmo projeto sobre o mesmo assunto.
3. Mais de um candidato, ou nenhum projeto claro: pergunte antes de escrever.

## 3. Escreva

**Plano que já existe:**
- Log: `- AAAA-MM-DD: <o que foi feito>, <dono/repo#n ou commit>`.
- Fases: marque `- [x] F3 Nome — AAAA-MM-DD` só com evidência (PR mergeado ou commit na branch principal). Trabalho feito mas ainda em PR aberto não marca fase: vai para "Como está".
- "## Para você": reescreva "Como está" com o estado real e "Precisa de você" com o que mudou. Mantenha com o mesmo texto os itens que continuam valendo; marque [x] os que este trabalho resolveu. No máximo 3 itens; nada vago; "Decidir" só para escolha do usuário, com as opções e a recomendação na linha.
- Atualize a linha `**Conferido:** AAAA-MM-DD · <o que foi olhado>`.
- Mude `atualizado` no cabeçalho só se marcou fase ou mudou o status.

**Sem plano, e o trabalho é de verdade** (tem PR ou branch, ou vai continuar em outra sessão): crie `~/planos/projetos/<projeto>/planos/<AAAA-MM-DD>-<slug>/plano.md` no padrão da skill `planejamento`, com status `andamento` (ou `revisao`, se o PR já espera revisão), as fases feitas marcadas com a evidência e as próximas em aberto. Projeto novo: acrescente em `projetos.yaml` (nome e o slug na `ordem` dos dois contextos).

**Trabalho pequeno e já encerrado** (uma pergunta, um teste, um ajuste sem PR): não crie plano. Diga que não havia o que registrar.

**Tarefas do dia:** se `~/planos/tarefas/<hoje>.md` tem uma tarefa que este trabalho resolveu, marque `[x]` e ponha logo abaixo `  - Conferido AAAA-MM-DD · já feito: <evidência>`. Não crie tarefa nova para o que já está andando.

## 4. Feche

```bash
git -C ~/planos add -A && git -C ~/planos commit -m "<id do plano>: <o que foi registrado>"
~/.local/bin/planos hoje --escrever --silencioso
```

Responda em até 4 linhas: qual plano foi atualizado ou criado, o que entrou no Log, quais fases ou tarefas foram marcadas e o que ficou em "Precisa de você".

## Limites

- Só escreva em `~/planos`. Não mexa no código nem no git do repositório de trabalho por causa desta skill.
- Não invente: sem evidência, não marque fase nem diga que foi feito.
- Nunca apague planos nem arquivos. Nunca envie mensagens a ninguém.
- Responda no idioma do usuário. Os títulos fixos dos arquivos (`## Para você`, `**Como está:**`, `Conferido`, os tipos dos itens) ficam em português, porque o app lê os planos por eles.

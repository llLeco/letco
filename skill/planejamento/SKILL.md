---
name: planejamento
description: Use sempre que o usuário pedir um plano, planejamento, handoff, auditoria, spec, brief ou design de implementação, ou quando trabalhar numa fase de um plano que vive em ~/planos. Define onde salvar, o cabeçalho padrão, a estrutura do corpo e como registrar progresso.
---

# Planejamento — padrão de documentos do Letco

Todos os planejamentos vivem em `~/planos`, um repositório git local com uma pasta por projeto. O app **Letco** lê esses arquivos; seguir este padrão é o que faz o plano aparecer na lista do dia.

## 1. Onde salvar

1. Descubra o projeto pelo diretório atual, pelo repositório ou perguntando. Os projetos estão em `~/planos/projetos.yaml` e em `~/planos/projetos/<projeto>/`.
2. Salve em `~/planos/projetos/<projeto>/planos/<AAAA-MM-DD>-<slug>/plano.md`.
3. Sem acesso a `~/planos` (ex.: Claude na nuvem): entregue o `plano.md` como arquivo para o usuário salvar em `~/planos/entrada/`. O app importa de lá.

## 2. Cabeçalho padrão (obrigatório e completo)

```yaml
---
id: <projeto>-<slug>
projeto: <projeto>
titulo: <título curto>
status: proximo        # ideia | proximo | andamento | revisao | bloqueado | feito | arquivado
prioridade: media      # alta | media | baixa
prazo: AAAA-MM-DD      # opcional
responsavel: <nome em `usuario` no projetos.yaml>
pessoas: []
agente: claude         # claude | codex
worktree: ~/orca/workspaces/<repo>/<nome>   # opcional
origem: https://claude.ai/...               # quando veio de um artifact/design
atualizado: AAAA-MM-DD
---
```

## 3. Estrutura do corpo

```markdown
# <Título>

## Para você
**Do que se trata:** <1 ou 2 frases simples: o que muda quando isso ficar pronto>
**Como está:** <estado real em 1 ou 2 frases>
**Precisa de você:**
- [ ] <Tipo>: <ação concreta>
**Conferido:** AAAA-MM-DD · <o que foi olhado>

## Objetivo
Uma frase.

## Contexto
O necessário para alguém (ou outro agente) continuar sem perguntar.

## Fases
- [ ] F1 <fase>
- [ ] F2 <fase>

## Decisões em aberto
- [ ] <decisão que só o usuário toma>

## Pessoas e cobranças
- [ ] <Pessoa>: <o que está devendo> (desde AAAA-MM-DD)

## Critério de pronto
<como saber que acabou>

## Log
- AAAA-MM-DD: plano criado
```

Plano pequeno (bug fix): mesmo cabeçalho, corpo curto, uma ou duas fases.

## 4. Artifacts e designs do Claude

Quando o resultado for um artifact ou design no Claude, crie também uma cópia `.md` na pasta do plano (ex.: `design.md`) com o link no campo `origem`, e atualize a cópia sempre que o artifact mudar.

## 5. Ao trabalhar numa fase

1. Marque o checkbox e acrescente a data: `- [x] F3 Implementar home — 2026-10-28`.
2. Acrescente uma linha no Log: `- AAAA-MM-DD: o que foi feito`.
3. Atualize `atualizado` no cabeçalho.
4. Status: primeira fase marcada → `andamento`; todas marcadas → `revisao`. Só o usuário passa para `feito`.

Se o comando `planos` existir no terminal, `planos fase concluir <id> F3` faz os passos 1 a 4 de uma vez e grava o commit. `planos ver <id>` mostra o plano e `planos novo <projeto> "título"` cria um no padrão.

## 6. "Para você" (topo do plano)

Quem implementa e revisa é IA; o usuário (o dono dos planos, nome em `usuario` no projetos.yaml) decide, desbloqueia, testa no app LIVE quando precisa e fala com pessoas. A seção "Para você" é o que ele lê: palavras simples, sem jargão, no máximo 3 itens em "Precisa de você", cada um começando com um tipo: Continuar, Testar no app, Decidir, Mensagem, Cobrar, Aprovar, Revisar, Acesso ou Arquivar. Em "Mensagem" (e em "Cobrar" com mensagem sugerida), escreva o rascunho em inglês, entre aspas, e nunca envie; o resto do texto segue em português. Se nada depende dele: `**Precisa de você:** nada agora — <o que está andando>`.

Reescreva "Para você" sempre que terminar um trabalho no plano. Ao conferir no GitHub, marque fase só com evidência (PR mergeado, commit na branch principal), registre no Log e atualize a linha **Conferido**. Não mude `atualizado` só por reescrever "Para você".

## Limites

- Nunca apague planos: para tirar de cena, use `status: arquivado`.
- Nunca envie mensagens a terceiros. Liste em "Pessoas e cobranças" e deixe o usuário decidir.

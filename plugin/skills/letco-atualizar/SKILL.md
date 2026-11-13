---
name: letco-atualizar
description: Atualiza o aplicativo Letco deste Mac para a versão mais nova do repositório (baixa, compila, instala e reabre) e reinstala o comando planos e as skills. Use quando o usuário pedir "atualiza o app Letco", "instala a versão nova do Letco" ou "/letco-atualizar".
argument-hint: "[pasta do repositório, se não for a de sempre]"
disable-model-invocation: true
---

# Letco: atualizar o aplicativo

Baixa a versão mais nova do Letco, compila e instala em `/Applications`. Os planos em `~/planos` não são tocados.

Pasta indicada pelo usuário, se houver: $ARGUMENTS

## 1. Ache o repositório

Nesta ordem, use a primeira pasta que for um clone do Letco (`git -C <pasta> remote get-url origin` termina em `letco` ou `letco.git`, e existe `src-tauri/tauri.conf.json`):
1. a pasta em $ARGUMENTS;
2. a pasta gravada em `~/planos/.indice/letco-repo` (uma linha com o caminho);
3. `~/letco`, `~/Developer/letco`, `~/Projects/letco`, `~/code/letco`, `~/dev/letco`, `~/src/letco`, `~/Documents/letco`.

Não achou: pergunte onde está o clone, ou ofereça `gh repo clone llLeco/letco ~/letco`. Quando achar, grave o caminho em `~/planos/.indice/letco-repo`.

## 2. Confira antes de mexer

```bash
git -C <repo> status --short
git -C <repo> fetch -q origin && git -C <repo> log --oneline HEAD..origin/main
```

- Há mudanças locais não commitadas: pare e mostre quais são. Não faça `stash`, `reset` nem `checkout` por conta própria.
- Nenhum commit novo em `origin/main`: diga "o Letco já está na versão mais nova" e pare, a menos que o usuário peça para reinstalar mesmo assim.
- Faltam ferramentas (`node`, `pnpm`, `cargo`): diga qual falta e como instalar (o README do repositório tem os comandos) e pare.

## 3. Atualize, compile e instale

```bash
cd <repo> && git pull --ff-only && pnpm install && pnpm check && pnpm release
```

Compilar leva alguns minutos: rode em segundo plano e avise quando terminar. Se `pnpm check` ou `pnpm release` falhar, pare, mostre o erro e não instale: a versão antiga continua funcionando.

Só com tudo verde:

```bash
pkill -f "/Applications/Letco.app"; sleep 1
rm -rf /Applications/Letco.app && ditto <repo>/src-tauri/target/release/bundle/macos/Letco.app /Applications/Letco.app
open /Applications/Letco.app
```

## 4. Comando e skills

O comando `planos` aponta para dentro do app, então já fica atualizado. Copie as skills desta versão para o Claude:

```bash
for s in planejamento letco letco-atualizar; do mkdir -p ~/.claude/skills/$s && cp <repo>/plugin/skills/$s/SKILL.md ~/.claude/skills/$s/SKILL.md; done
~/.local/bin/planos ajuda | head -1
```

## 5. Diga o que mudou

Em até 5 linhas: de qual commit para qual (`git log --oneline <antes>..HEAD`, resumido em palavras simples), se o app reabriu e se alguma rotina instalada ficou com texto antigo (a tela Rotinas do app mostra e tem o botão "Atualizar o texto").

## Limites

- Nunca mexa em `~/planos` além do arquivo `.indice/letco-repo`.
- Nunca descarte mudanças locais do repositório.
- Responda no idioma do usuário.

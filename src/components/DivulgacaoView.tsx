import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, FolderOpen, ImageIcon, LoaderCircle, Megaphone, RefreshCw, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { parseDay, todayISO } from '../lib/dates'
import { dfLocale, isEn, t } from '../lib/i18n'
import { campaignLabel, parsePost, withStatus, type Post, type PostStatus } from '../lib/posts'
import { CAMPANHAS_FILE, DIVULGAR_STATE_DIR, divulgarConsolePrompt, parseCampanhas } from '../lib/divulgar'
import { useStore } from '../store'
import { Button, cn, Empty, IconButton, SectionTitle } from './ui'

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-[12px] border border-[var(--border)] bg-[var(--bg)]', className)}>{children}</section>
}

function dayLabel(d?: string) {
  const day = parseDay(d)
  return day ? format(day, isEn() ? 'MMM d' : "d 'de' MMM", { locale: dfLocale() }) : undefined
}

function useImage(rel: string | null) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    setSrc(null)
    if (rel) api.readImage(rel).then(setSrc, () => setSrc(null))
  }, [rel])
  return src
}

const LANG_KEY = 'planos.divulgacao.lang'

function PostCard({ post, onStatus, nomes }: { post: Post; onStatus: (p: Post, s: PostStatus) => void; nomes?: Record<string, string> }) {
  const src = useImage(post.image)
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const texto = post.textos.find((tx) => tx.lang === lang) ?? post.textos[0]
  const [copied, setCopied] = useState<'imagem' | 'texto' | null>(null)

  const pick = (l: string) => {
    setLang(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }
  const flash = (k: 'imagem' | 'texto') => {
    setCopied(k)
    setTimeout(() => setCopied((c) => (c === k ? null : c)), 1800)
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-[var(--bg-subtle)]">
        {src ? (
          <img src={src} alt={post.titulo} className="block aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-[var(--text-3)]">
            <ImageIcon size={28} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug">{post.titulo}</div>
            <div className="mt-0.5 text-[12px] text-[var(--text-3)]">
              {campaignLabel(post.campaign, nomes)}
              {post.date && ` · ${dayLabel(post.date)}`}
            </div>
          </div>
          <IconButton label={t('Abrir pasta', 'Open folder')} onClick={() => api.openPath(post.dir, true)}>
            <FolderOpen size={14} />
          </IconButton>
        </div>

        {post.textos.length > 1 && (
          <div className="flex gap-1">
            {post.textos.map((tx) => (
              <button
                key={tx.lang}
                onClick={() => pick(tx.lang)}
                className={cn(
                  'h-6 rounded-full px-2.5 text-[12px] font-medium',
                  tx === texto ? 'bg-accent-soft text-accent' : 'text-[var(--text-2)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {tx.lang}
              </button>
            ))}
          </div>
        )}
        {texto && (
          <div className="selectable whitespace-pre-wrap rounded-[10px] bg-[var(--bg-subtle)] p-3 text-[13px] leading-relaxed">{texto.text}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {post.image && (
            <Button
              variant="primary"
              onClick={() =>
                api.copyImage(post.image!).then(
                  () => {
                    flash('imagem')
                    toast.success(t('Imagem copiada', 'Image copied'), { description: t('No canal do Discord, cole com ⌘V.', 'In the Discord channel, paste with ⌘V.') })
                  },
                  (e) => toast.error(t('Não consegui copiar a imagem', "Couldn't copy the image"), { description: String(e) }),
                )
              }
            >
              {copied === 'imagem' ? <Check size={14} /> : <ImageIcon size={14} />} {t('1. Copiar imagem', '1. Copy image')}
            </Button>
          )}
          {texto && (
            <Button
              onClick={() =>
                navigator.clipboard.writeText(texto.text).then(
                  () => {
                    flash('texto')
                    toast.success(t('Texto copiado', 'Text copied'), { description: t('Cole junto da imagem e envie.', 'Paste it with the image and send.') })
                  },
                  () => toast.error(t('Não consegui copiar o texto', "Couldn't copy the text")),
                )
              }
            >
              {copied === 'texto' ? <Check size={14} /> : <Copy size={14} />} {t('2. Copiar texto', '2. Copy text')}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => onStatus(post, 'descartado')}>
            <X size={14} /> {t('Descartar', 'Discard')}
          </Button>
          <Button onClick={() => onStatus(post, 'postado')}>
            <Check size={14} /> {t('Já postei', 'Posted')}
          </Button>
        </div>
        <div className="text-[12px] text-[var(--text-3)]">
          {t(
            'No Discord: cole a imagem (⌘V), depois o texto, e envie com a sua conta. Depois marque "Já postei".',
            'In Discord: paste the image (⌘V), then the text, and send it from your account. Then mark it "Posted".',
          )}
        </div>
      </div>
    </Card>
  )
}

function DoneRow({ post, onStatus }: { post: Post; onStatus: (p: Post, s: PostStatus) => void }) {
  return (
    <div className="flex h-10 items-center gap-3 rounded-[8px] px-2 hover:bg-[var(--bg-hover)]">
      {post.status === 'postado' ? <Check size={14} className="flex-none text-emerald-600 dark:text-emerald-400" /> : <X size={14} className="flex-none text-[var(--text-3)]" />}
      <span className="min-w-0 flex-1 truncate text-[13px]">{post.titulo}</span>
      <span className="flex-none text-[12px] text-[var(--text-3)]">
        {post.status === 'postado' ? t(`postado ${dayLabel(post.postadoEm) ?? ''}`, `posted ${dayLabel(post.postadoEm) ?? ''}`) : t('descartado', 'discarded')}
      </span>
      <IconButton label={t('Voltar para pendentes', 'Back to pending')} onClick={() => onStatus(post, 'pendente')}>
        <RotateCcw size={13} />
      </IconButton>
    </div>
  )
}

/** post que o agente ainda está montando (status gerando) */
function GeneratingRow({ post }: { post: Post }) {
  return (
    <div className="flex h-11 items-center gap-3 rounded-[8px] px-2">
      <LoaderCircle size={14} className="flex-none animate-spin text-accent" />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {post.titulo}
        <span className="text-[var(--text-3)]"> · {t('montando imagem e texto', 'putting together image and text')}</span>
      </span>
      <IconButton label={t('Abrir pasta', 'Open folder')} onClick={() => api.openPath(post.dir, true)}>
        <FolderOpen size={13} />
      </IconButton>
    </div>
  )
}

/** quando a branch das campanhas foi conferida pela última vez (o mais recente entre as campanhas) */
async function lastCheck(): Promise<Date | null> {
  const campanhas = parseCampanhas(await api.readText(CAMPANHAS_FILE).catch(() => null))
  let last: Date | null = null
  for (const c of campanhas) {
    const raw = await api.readText(`${DIVULGAR_STATE_DIR}/${c.slug}.json`).catch(() => '')
    try {
      const d = new Date(JSON.parse(raw).verificado)
      if (!isNaN(+d) && (!last || d > last)) last = d
    } catch {
      /* campanha ainda não verificada */
    }
  }
  return last
}

export function DivulgacaoView() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [checked, setChecked] = useState<Date | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const root = useStore((s) => s.env?.root ?? '~/planos')
  const sendToConsole = useStore((s) => s.sendToConsole)

  const reload = useCallback(async () => {
    try {
      const raw = await api.loadPosts()
      setPosts(raw.map(parsePost).sort((a, b) => b.folder.localeCompare(a.folder)))
      setChecked(await lastCheck())
      setNomes(Object.fromEntries(parseCampanhas(await api.readText(CAMPANHAS_FILE).catch(() => null)).map((c) => [c.slug, c.nome])))
    } catch (e) {
      toast.error(t('Não consegui ler os posts', "Couldn't read the posts"), { description: String(e) })
    }
  }, [])

  useEffect(() => {
    reload()
    let off: (() => void) | undefined
    api.onChange(reload).then((u) => (off = u))
    return () => off?.()
  }, [reload])

  async function setStatus(p: Post, status: PostStatus) {
    try {
      await api.writeText(`${p.dir}/post.md`, withStatus(p, status, todayISO()))
      await api.gitCommit(`divulgacao: ${p.campaign}/${p.folder} ${status}`).catch(() => undefined)
      await reload()
    } catch (e) {
      toast.error(t('Não consegui salvar', "Couldn't save"), { description: String(e) })
    }
  }

  const generating = posts?.filter((p) => p.status === 'gerando') ?? []
  const pending = posts?.filter((p) => p.status === 'pendente') ?? []
  const done = posts?.filter((p) => p.status === 'postado' || p.status === 'descartado') ?? []
  const checkedLabel = checked
    ? format(
        checked,
        todayISO(checked) === todayISO()
          ? isEn()
            ? "'today at' h:mm a"
            : "'hoje às' HH'h'mm"
          : isEn()
            ? "MMM d 'at' h:mm a"
            : "d 'de' MMM 'às' HH'h'mm",
        { locale: dfLocale() },
      )
    : null

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="flex items-end gap-3 pb-6 pt-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Divulgação', 'Promotion')}</h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--text-2)]">{t('Imagem e texto prontos para você postar no Discord com a sua conta.', 'Image and text ready for you to post on Discord from your account.')}</p>
          <p className="mt-1 text-[12px] text-[var(--text-3)]">
            {t(
              'A rotina confere a branch de cada campanha (divulgacao/campanhas.yaml) nos dias úteis às 9h, 13h e 17h',
              "The routine checks each campaign's branch (divulgacao/campanhas.yaml) on weekdays at 9 AM, 1 PM and 5 PM",
            )}
            {checkedLabel ? t(` · última verificação ${checkedLabel}`, ` · last checked ${checkedLabel}`) : ''}.
          </p>
        </div>
        <Button size="sm" onClick={() => sendToConsole(divulgarConsolePrompt(root))}>
          <RefreshCw size={13} /> {t('Verificar agora', 'Check now')}
        </Button>
      </header>

      {posts && !posts.length && (
        <Empty icon={<Megaphone size={28} />} title={t('Nenhum post ainda', 'No posts yet')}>
          {t(
            'Quando entrar uma novidade na branch principal de uma campanha, a imagem e o texto aparecem aqui. As campanhas (repositório, branch, regras do post) ficam em divulgacao/campanhas.yaml: peça ao Console para criar a sua.',
            "When something new lands on a campaign's main branch, the image and text show up here. Campaigns (repository, branch, post rules) live in divulgacao/campanhas.yaml: ask the Console to create yours.",
          )}
        </Empty>
      )}

      <div className="flex flex-col gap-5">
        {!!generating.length && (
          <div>
            <SectionTitle icon={<LoaderCircle size={14} className="text-accent" />} count={generating.length}>
              {t('Montando', 'In progress')}
            </SectionTitle>
            <Card className="p-1.5">
              {generating.map((p) => (
                <GeneratingRow key={p.dir} post={p} />
              ))}
            </Card>
          </div>
        )}
        {!!pending.length && (
          <div>
            <SectionTitle icon={<Megaphone size={14} className="text-accent" />} count={pending.length}>
              {t('Para postar', 'To post')}
            </SectionTitle>
            <div className="flex flex-col gap-4">
              {pending.map((p) => (
                <PostCard key={p.dir} post={p} onStatus={setStatus} nomes={nomes} />
              ))}
            </div>
          </div>
        )}
        {!!done.length && (
          <div>
            <SectionTitle icon={<Check size={14} />} count={done.length}>
              {t('Já resolvidos', 'Done')}
            </SectionTitle>
            <Card className="p-1.5">
              {done.map((p) => (
                <DoneRow key={p.dir} post={p} onStatus={setStatus} />
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

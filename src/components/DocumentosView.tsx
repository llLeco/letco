import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, File, FileText, Files, FolderOpen, Inbox, MessagesSquare, Search, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, isTauri } from '../lib/api'
import { relativeAge } from '../lib/dates'
import { buildDocs, DOC_KINDS, docKindLabel, filterDocs, type Doc, type DocFile, type DocKind } from '../lib/docs'
import { t } from '../lib/i18n'
import { useStore } from '../store'
import { FileViewer } from './FileViewer'
import { Button, cn, Empty, IconButton, ProjectChip, StatusIcon } from './ui'

const KIND_ICON: Record<DocKind, typeof File> = { plano: FileText, claude: Sparkles, anexo: File, projeto: FolderOpen, conversa: MessagesSquare, entrada: Inbox }

function DocRow({ doc, onOpen }: { doc: Doc; onOpen: (d: Doc) => void }) {
  const project = useStore((s) => (doc.project ? s.project(doc.project) : undefined))
  const plan = useStore((s) => (doc.kind === 'plano' ? s.plans.find((p) => p.fm.id === doc.planId) : undefined))
  const go = useStore((s) => s.go)
  const Icon = KIND_ICON[doc.kind]
  return (
    <div className="group flex items-center gap-3 rounded-[9px] px-2.5 py-2 hover:bg-[var(--bg-hover)]">
      <button onClick={() => onOpen(doc)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex w-4 flex-none justify-center text-[var(--text-3)]">{plan ? <StatusIcon status={plan.fm.status} /> : <Icon size={15} className={doc.kind === 'claude' ? 'text-accent' : undefined} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px]">{doc.title}</span>
          <span className="block truncate text-[12px] text-[var(--text-3)]">
            {doc.kind === 'plano' ? docKindLabel('plano').replace(/s$/, '') : doc.sub}
            {doc.kind !== 'plano' && doc.planTitle && doc.kind !== 'claude' && ` · ${doc.planTitle}`}
          </span>
        </span>
      </button>
      {doc.planId && doc.kind !== 'plano' && (
        <button onClick={() => go({ kind: 'plan', id: doc.planId! })} className="hidden flex-none text-[12px] text-[var(--text-3)] hover:text-[var(--text)] group-hover:block">
          {t('ver o plano', 'view plan')}
        </button>
      )}
      {doc.url && <ExternalLink size={13} className="flex-none text-[var(--text-3)]" />}
      {project && <ProjectChip name={project.nome} color={project.cor} />}
      <span className="w-[76px] flex-none text-right text-[12px] tabular-nums text-[var(--text-3)]">{relativeAge(new Date(doc.mtime).toISOString().slice(0, 10))}</span>
    </div>
  )
}

/** área de soltar: arquivos arrastados do Finder, ou um link/texto colado */
function Soltar({ over, pendentes }: { over: boolean; pendentes: string[] }) {
  const guardarNota = useStore((s) => s.guardarNota)
  const organizar = useStore((s) => s.organizar)
  const soltarArquivos = useStore((s) => s.soltarArquivos)
  const [texto, setTexto] = useState('')
  const enviar = () => {
    guardarNota(texto)
    setTexto('')
  }
  return (
    <div className={cn('mb-6 rounded-[12px] border border-dashed px-4 py-4 transition-colors', over ? 'border-accent bg-accent-soft' : 'border-[var(--border-strong)]')}>
      <div className="flex items-start gap-3">
        <Upload size={18} className={cn('mt-0.5 flex-none', over ? 'text-accent' : 'text-[var(--text-3)]')} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">{over ? t('Solte para a IA organizar', 'Drop for the AI to organize') : t('Arraste arquivos para cá', 'Drag files here')}</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-2)]">
            {t(
              'Plano, brief, PDF, print, anotação: a IA lê, decide se é plano novo, anexo de um plano ou documento de projeto, e põe no lugar. O arquivo é copiado; o original fica onde está.',
              'A plan, brief, PDF, screenshot, note: the AI reads it, decides whether it is a new plan, an attachment to a plan or a project document, and files it. The file is copied; the original stays where it is.',
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && texto.trim() && enviar()}
              placeholder={t('Ou cole um link do Claude (design, artifact) ou um texto', 'Or paste a Claude link (design, artifact) or some text')}
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border-strong)] bg-transparent px-2.5 text-[13px] outline-none placeholder:text-[var(--text-3)] focus:border-accent focus:ring-[3px] focus:ring-accent/15"
            />
            <Button disabled={!texto.trim()} onClick={enviar}>
              {t('Organizar', 'Organize')}
            </Button>
            {!isTauri && (
              <Button variant="ghost" onClick={() => soltarArquivos(['/exemplo/brief-novo.pdf'])}>
                {t('Simular arquivo', 'Simulate a file')}
              </Button>
            )}
          </div>
          {pendentes.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-amber-600 dark:text-amber-400">
              <Inbox size={13} />
              <span className="flex-1">
                {t(
                  `${pendentes.length === 1 ? '1 arquivo espera' : `${pendentes.length} arquivos esperam`} em entrada/organizar/.`,
                  `${pendentes.length === 1 ? '1 file is' : `${pendentes.length} files are`} waiting in entrada/organizar/.`,
                )}
              </span>
              <Button size="sm" onClick={() => organizar(pendentes)}>
                {t('Organizar agora', 'Organize now')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DocumentosView() {
  const plans = useStore((s) => s.plans)
  const project = useStore((s) => s.project)
  const go = useStore((s) => s.go)
  const soltarArquivos = useStore((s) => s.soltarArquivos)
  const [files, setFiles] = useState<DocFile[] | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<DocKind | 'todos'>('todos')
  const [viewing, setViewing] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [limit, setLimit] = useState(120)

  const reload = useCallback(async () => {
    try {
      setFiles(await api.loadDocuments())
    } catch (e) {
      toast.error(t('Não consegui listar os documentos', "Couldn't list the documents"), { description: String(e) })
    }
  }, [])

  useEffect(() => {
    reload()
    let off: (() => void) | undefined
    api.onChange(reload).then((u) => (off = u))
    return () => off?.()
  }, [reload])

  useEffect(() => {
    let off: (() => void) | undefined
    let gone = false
    api
      .onFileDrop((e) => {
        if (e.type === 'drop') {
          setOver(false)
          if (e.paths.length) soltarArquivos(e.paths)
        } else setOver(e.type === 'over')
      })
      .then((u) => (gone ? u() : (off = u)))
    return () => {
      gone = true
      off?.()
    }
  }, [soltarArquivos])

  const docs = useMemo(() => buildDocs(files ?? [], plans), [files, plans])
  const counts = useMemo(() => Object.fromEntries(DOC_KINDS.map((k) => [k, docs.filter((d) => d.kind === k).length])) as Record<DocKind, number>, [docs])
  const shown = useMemo(() => filterDocs(docs, q, kind, (slug) => (slug ? (project(slug)?.nome ?? slug) : '')), [docs, q, kind, project])
  const pendentes = docs.filter((d) => d.kind === 'entrada').map((d) => d.rel!)

  function open(d: Doc) {
    if (d.kind === 'plano' && d.planId) return go({ kind: 'plan', id: d.planId })
    if (d.url) return void api.openUrl(d.url)
    if (d.rel && /\.(md|txt)$/i.test(d.rel)) return setViewing(d.rel)
    if (d.rel) api.openPath(d.rel).catch((e) => toast.error(t('Não consegui abrir', "Couldn't open"), { description: String(e) }))
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-8 pb-24">
      <header className="flex items-end gap-3 pb-5 pt-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Documentos', 'Documents')}</h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--text-2)]">
            {t('Tudo o que existe nos seus projetos: planos, designs e artifacts do Claude, anexos, documentos e conversas.', 'Everything in your projects: plans, Claude designs and artifacts, attachments, documents and conversations.')}
          </p>
        </div>
        <IconButton label={t('Mostrar a pasta no Finder', 'Show the folder in Finder')} onClick={() => api.openPath('projetos', true)}>
          <FolderOpen size={15} />
        </IconButton>
      </header>

      <Soltar over={over} pendentes={pendentes} />

      <div className="mb-3 flex h-9 items-center gap-2 rounded-[9px] border border-[var(--border)] px-3">
        <Search size={14} className="text-[var(--text-3)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar por título, arquivo, plano ou projeto', 'Search by title, file, plan or project')} className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-3)]" />
        <span className="text-[12px] tabular-nums text-[var(--text-3)]">{shown.length}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['todos', ...DOC_KINDS] as const).map((k) => {
          const n = k === 'todos' ? docs.length : counts[k]
          if (k !== 'todos' && !n) return null
          return (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn('h-7 rounded-full px-3 text-[12.5px] transition-colors', kind === k ? 'bg-[var(--bg-active)] font-medium text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-hover)]')}
            >
              {k === 'todos' ? t('Todos', 'All') : docKindLabel(k)} <span className="tabular-nums text-[var(--text-3)]">{n}</span>
            </button>
          )
        })}
      </div>

      {files && !docs.length && (
        <Empty icon={<Files size={28} />} title={t('Nenhum documento ainda', 'No documents yet')}>
          {t('Arraste um arquivo para cá ou crie o primeiro plano.', 'Drag a file here or create your first plan.')}
        </Empty>
      )}
      {docs.length > 0 && !shown.length && <p className="px-2.5 py-6 text-[13px] text-[var(--text-3)]">{t('Nada encontrado com esse filtro.', 'Nothing matches this filter.')}</p>}

      <div className="flex flex-col">
        {shown.slice(0, limit).map((d) => (
          <DocRow key={d.key} doc={d} onOpen={open} />
        ))}
      </div>
      {shown.length > limit && (
        <div className="mt-3 text-center">
          <Button variant="ghost" onClick={() => setLimit(limit + 200)}>
            {t(`Mostrar mais (${shown.length - limit})`, `Show more (${shown.length - limit})`)}
          </Button>
        </div>
      )}

      {viewing && <FileViewer rel={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

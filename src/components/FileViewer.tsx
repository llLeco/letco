import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { ExternalLink, FileText, X } from 'lucide-react'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { splitFrontmatter } from '../lib/plan'
import { Markdown } from './Markdown'
import { Button, IconButton } from './ui'

export function FileViewer({ rel, onClose }: { rel: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    api.readText(rel).then(setText).catch((e) => setText(t(`Não consegui ler o arquivo: ${e}`, `Couldn't read the file: ${e}`)))
  }, [rel])
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-black/25 dark:bg-black/50" />
        <Dialog.Content className="animate-pop fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[min(820px,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-[var(--bg)] shadow-[var(--shadow-pop)] outline-none">
          <div className="flex h-12 flex-none items-center gap-2 border-b border-[var(--border)] px-4">
            <FileText size={14} className="text-[var(--text-3)]" />
            <Dialog.Title className="flex-1 truncate text-[13px] font-medium">{rel.split('/').pop()}</Dialog.Title>
            <Button size="sm" variant="ghost" onClick={() => api.openPath(rel)}>
              <ExternalLink size={13} /> {t('Abrir no editor', 'Open in editor')}
            </Button>
            <Dialog.Close asChild>
              <IconButton label={t('Fechar', 'Close')}>
                <X size={15} />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="scroll-area flex-1 px-8 py-6">
            {text === null ? <div className="text-[var(--text-3)]">{t('Carregando…', 'Loading…')}</div> : <Markdown className="selectable">{splitFrontmatter(text).body}</Markdown>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

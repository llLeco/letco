import type { Env, Opener, WorkspaceRaw } from './types'
import type { RoutinesRaw } from './routines'
import type { LocalRepo } from './prs'
import type { PostRaw } from './posts'
import { mockApi } from './mock'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return mockApi(cmd, args) as Promise<T>
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export const api = {
  loadWorkspace: () => call<WorkspaceRaw>('load_workspace'),
  environment: () => call<Env>('environment'),
  readText: (rel: string) => call<string>('read_text', { rel }),
  writeText: (rel: string, content: string) => call<void>('write_text', { rel, content }),
  moveFile: (from: string, to: string) => call<void>('move_file', { from, to }),
  initWorkspace: (projetosYaml: string) => call<void>('init_workspace', { projetosYaml }),
  gitCommit: (message: string) => call<boolean>('git_commit', { message }),
  readHermes: () => call<{ planosJson: string | null; copies: [string, string][]; analyses: [string, string][] }>('read_hermes'),
  launchAgent: (a: { agent: string; worktree?: string; cwd: string; prompt: string; opener: Opener }) =>
    call<string>('launch_agent', a),
  openPath: (rel: string, reveal = false) => call<void>('open_path', { rel, reveal }),
  openExternalPath: (path: string) => call<void>('open_external_path', { path }),
  pathExists: (path: string) => call<boolean>('path_exists', { path }),
  installSkill: () => call<string>('install_skill'),
  installCli: () => call<string>('install_cli'),
  ghUser: () => call<string | null>('gh_user'),
  exportSkillZip: () => call<string>('export_skill_zip'),
  loadRoutines: () => call<RoutinesRaw>('load_routines'),
  hermesCron: (action: 'pause' | 'resume', id: string) => call<string>('hermes_cron', { action, id }),
  planosSchedule: (on: boolean) => call<string>('planos_schedule', { on }),
  openClaudeSession: (id: string) => call<void>('open_claude_session', { id }),
  consoleStart: (prompt: string, cols: number, rows: number) => call<string>('console_start', { prompt, cols, rows }),
  consoleWrite: (data: string) => call<void>('console_write', { data }),
  consoleResize: (cols: number, rows: number) => call<void>('console_resize', { cols, rows }),
  consoleStop: () => call<void>('console_stop'),
  loadPosts: () => call<PostRaw[]>('load_posts'),
  loadResumos: () => call<[string, string][]>('load_resumos'),
  discordTokenSet: (token: string) => call<void>('discord_token_set', { token }),
  loadDiscord: () =>
    call<{ tarefas: [string, string][]; conversas: [string, string, string][]; estado: [string, string][] }>('load_discord'),
  discordTokenStatus: () => call<boolean>('discord_token_status'),
  discordTokenClear: () => call<void>('discord_token_clear'),
  readImage: (rel: string) => call<string>('read_image', { rel }),
  copyImage: (rel: string) => call<void>('copy_image', { rel }),
  localRepos: () => call<LocalRepo[]>('local_repos'),
  gitRemotes: (paths: string[]) => call<[string, string | null][]>('git_remotes', { paths }),
  async openInChrome(url: string) {
    if (!isTauri) return void window.open(url, '_blank')
    await call<void>('open_in_chrome', { url })
  },
  async openUrl(url: string) {
    if (!isTauri) return void window.open(url, '_blank')
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  },
  async pickFolder(defaultPath?: string) {
    if (!isTauri) return window.prompt('Caminho do worktree', defaultPath ?? '') || null
    const { open } = await import('@tauri-apps/plugin-dialog')
    const r = await open({ directory: true, defaultPath })
    return typeof r === 'string' ? r : null
  },
  async onChange(cb: () => void) {
    if (!isTauri) {
      window.addEventListener('planos-mock-changed', cb)
      return () => window.removeEventListener('planos-mock-changed', cb)
    }
    const { listen } = await import('@tauri-apps/api/event')
    return listen('planos://changed', cb)
  },
}

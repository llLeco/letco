//! Letco — backend nativo.
//!
//! Tudo vive em arquivos Markdown dentro de `~/planos` (ou `PLANOS_DIR`).
//! O backend só lê, escreve, observa mudanças, faz commit no git e abre agentes.
//! Nunca apaga nada: "apagar" no app é arquivar (status no cabeçalho).

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

mod console;

const SKILL_MD: &str = include_str!("../../plugin/skills/planejamento/SKILL.md");
/// as skills que o app instala em ~/.claude/skills: o padrão dos planos e os dois atalhos (/letco e /letco-atualizar)
const SKILLS: [(&str, &str); 3] = [
    ("planejamento", SKILL_MD),
    ("letco", include_str!("../../plugin/skills/letco/SKILL.md")),
    ("letco-atualizar", include_str!("../../plugin/skills/letco-atualizar/SKILL.md")),
];
const AGENTS_BEGIN: &str = "<!-- planos:planejamento:inicio -->";
const AGENTS_END: &str = "<!-- planos:planejamento:fim -->";

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

pub(crate) fn root() -> PathBuf {
    match std::env::var("PLANOS_DIR") {
        Ok(p) if !p.is_empty() => PathBuf::from(p),
        _ => home().join("planos"),
    }
}

/// Resolve um caminho relativo à raiz, recusando qualquer coisa que escape dela.
fn safe_join(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(format!("caminho absoluto não permitido: {rel}"));
    }
    for c in p.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("caminho inválido: {rel}")),
        }
    }
    Ok(base.join(p))
}

/// Caminhos de busca para binários quando o app é aberto pelo Finder (PATH mínimo).
pub(crate) fn augmented_path() -> String {
    let h = home();
    let mut parts: Vec<String> = vec![
        h.join(".local/bin").display().to_string(),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        h.join(".cargo/bin").display().to_string(),
        h.join(".bun/bin").display().to_string(),
    ];
    if let Ok(entries) = fs::read_dir(h.join(".nvm/versions/node")) {
        for e in entries.flatten() {
            parts.push(e.path().join("bin").display().to_string());
        }
    }
    parts.push(std::env::var("PATH").unwrap_or_default());
    parts.push("/usr/bin:/bin:/usr/sbin:/sbin".into());
    parts.join(":")
}

pub(crate) fn which(bin: &str) -> Option<PathBuf> {
    for dir in augmented_path().split(':') {
        let p = Path::new(dir).join(bin);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn mtime(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_opt(p: &Path) -> Option<String> {
    fs::read_to_string(p).ok()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanFile {
    /// relativo à raiz, ex.: projetos/acme/planos/2026-10-20-x/plano.md
    path: String,
    project: String,
    folder: String,
    content: String,
    mtime: u64,
    /// outros arquivos da pasta do plano (design.md, anexos/…)
    extras: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    slug: String,
    content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    root: String,
    exists: bool,
    is_git: bool,
    projetos_yaml: Option<String>,
    hoje: Option<String>,
    semana: Option<String>,
    /// arquivo mais recente de tarefas/ (nome, conteúdo): as tarefas do dia
    tarefas: Option<(String, String)>,
    /// discord/canais.yaml: canais do Discord que a rotina lê
    discord: Option<String>,
    projects: Vec<ProjectFile>,
    plans: Vec<PlanFile>,
    entrada: Vec<String>,
}

fn list_extras(dir: &Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || (prefix.is_empty() && name == "plano.md") {
            continue;
        }
        let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        if e.path().is_dir() {
            list_extras(&e.path(), &rel, out);
        } else {
            out.push(rel);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocFile {
    /// relativo à raiz, ex.: projetos/acme/docs/brief.md
    path: String,
    size: u64,
    mtime: u64,
}

fn walk_docs(dir: &Path, rel: &str, depth: u8, out: &mut Vec<DocFile>) {
    if depth == 0 || out.len() >= 5000 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let p = e.path();
        let r = format!("{rel}/{name}");
        if p.is_dir() {
            walk_docs(&p, &r, depth - 1, out);
        } else {
            out.push(DocFile { size: fs::metadata(&p).map(|m| m.len()).unwrap_or(0), mtime: mtime(&p), path: r });
        }
    }
}

/// Todos os arquivos de projetos/ e o que está em entrada/organizar/, para a tela Documentos.
#[tauri::command]
fn load_documents() -> Vec<DocFile> {
    let r = root();
    let mut out = vec![];
    walk_docs(&r.join("projetos"), "projetos", 8, &mut out);
    walk_docs(&r.join(ORGANIZAR), ORGANIZAR, 2, &mut out);
    out
}

/// onde ficam os arquivos soltos na tela Documentos até a IA decidir o lugar de cada um
const ORGANIZAR: &str = "entrada/organizar";

/// Copia arquivos soltos na janela para entrada/organizar/ (o original fica onde está). Devolve os caminhos relativos.
#[tauri::command]
fn import_dropped(paths: Vec<String>) -> Result<Vec<String>, String> {
    let dir = root().join(ORGANIZAR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for src in paths.iter().take(30) {
        let src = Path::new(src);
        let meta = fs::metadata(src).map_err(|e| format!("{}: {e}", src.display()))?;
        let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if !meta.is_file() || name.is_empty() || name.starts_with('.') {
            return Err(format!("{name}: só arquivos (pastas não entram)"));
        }
        if meta.len() > 50 * 1024 * 1024 {
            return Err(format!("{name}: maior que 50 MB"));
        }
        // nunca sobrescreve: brief.md, brief-2.md, brief-3.md…
        let (stem, ext) = match name.rsplit_once('.') {
            Some((a, b)) if !a.is_empty() => (a.to_string(), format!(".{b}")),
            _ => (name.clone(), String::new()),
        };
        let mut dest = dir.join(&name);
        let mut n = 2;
        while dest.exists() {
            dest = dir.join(format!("{stem}-{n}{ext}"));
            n += 1;
        }
        fs::copy(src, &dest).map_err(|e| format!("{name}: {e}"))?;
        out.push(format!("{ORGANIZAR}/{}", dest.file_name().unwrap().to_string_lossy()));
    }
    Ok(out)
}

/// tarefas/AAAA-MM-DD.md mais recente
fn latest_tarefas(r: &Path) -> Option<(String, String)> {
    let name = fs::read_dir(r.join("tarefas"))
        .ok()?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.len() == 13 && n.ends_with(".md") && n.as_bytes()[4] == b'-')
        .max()?;
    let content = read_opt(&r.join("tarefas").join(&name))?;
    Some((name, content))
}

#[tauri::command]
fn load_workspace() -> Workspace {
    let r = root();
    let mut ws = Workspace {
        root: r.display().to_string(),
        exists: r.join("projetos.yaml").is_file(),
        is_git: r.join(".git").exists(),
        projetos_yaml: read_opt(&r.join("projetos.yaml")),
        hoje: read_opt(&r.join("hoje.md")),
        semana: read_opt(&r.join("semana.md")),
        tarefas: latest_tarefas(&r),
        discord: read_opt(&r.join("discord/canais.yaml")),
        projects: vec![],
        plans: vec![],
        entrada: vec![],
    };
    if let Ok(entries) = fs::read_dir(r.join("entrada")) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".md") {
                ws.entrada.push(format!("entrada/{n}"));
            }
        }
    }
    let Ok(projects) = fs::read_dir(r.join("projetos")) else { return ws };
    for p in projects.flatten() {
        if !p.path().is_dir() {
            continue;
        }
        let slug = p.file_name().to_string_lossy().to_string();
        if slug.starts_with('.') {
            continue;
        }
        ws.projects.push(ProjectFile {
            slug: slug.clone(),
            content: read_opt(&p.path().join("projeto.md")),
        });
        let Ok(plans) = fs::read_dir(p.path().join("planos")) else { continue };
        for pl in plans.flatten() {
            let file = pl.path().join("plano.md");
            if !file.is_file() {
                continue;
            }
            let folder = pl.file_name().to_string_lossy().to_string();
            let mut extras = vec![];
            list_extras(&pl.path(), "", &mut extras);
            extras.sort();
            ws.plans.push(PlanFile {
                path: format!("projetos/{slug}/planos/{folder}/plano.md"),
                project: slug.clone(),
                folder,
                content: fs::read_to_string(&file).unwrap_or_default(),
                mtime: mtime(&file),
                extras,
            });
        }
    }
    ws
}

#[tauri::command]
fn read_text(rel: String) -> Result<String, String> {
    let p = safe_join(&root(), &rel)?;
    fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))
}

#[tauri::command]
fn write_text(rel: String, content: String) -> Result<(), String> {
    let p = safe_join(&root(), &rel)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // escrita atômica: arquivo temporário + rename
    let tmp = p.with_extension("md.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Move um arquivo dentro da raiz (usado para tirar itens de `entrada/` depois de importar).
#[tauri::command]
fn move_file(from: String, to: String) -> Result<(), String> {
    let a = safe_join(&root(), &from)?;
    let b = safe_join(&root(), &to)?;
    if b.exists() {
        return Err(format!("já existe: {to}"));
    }
    if let Some(parent) = b.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(a, b).map_err(|e| e.to_string())
}

fn git(args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(root())
        .env("PATH", augmented_path())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

#[tauri::command]
fn init_workspace(projetos_yaml: String) -> Result<(), String> {
    let r = root();
    for d in ["projetos", "entrada", "pedidos", ".indice"] {
        fs::create_dir_all(r.join(d)).map_err(|e| e.to_string())?;
    }
    if !r.join("projetos.yaml").exists() {
        fs::write(r.join("projetos.yaml"), projetos_yaml).map_err(|e| e.to_string())?;
    }
    if !r.join(".gitignore").exists() {
        fs::write(r.join(".gitignore"), ".DS_Store\n.indice/\n*.md.tmp\n").map_err(|e| e.to_string())?;
    }
    for d in ["entrada", "pedidos"] {
        let keep = r.join(d).join(".gitkeep");
        if !keep.exists() {
            let _ = fs::write(keep, "");
        }
    }
    if !r.join(".git").exists() {
        git(&["init", "-q"])?;
    }
    Ok(())
}

/// Commit de tudo que mudou. Envia ao remoto se houver um configurado.
#[tauri::command]
fn git_commit(app: AppHandle, message: String) -> Result<bool, String> {
    if !root().join(".git").exists() {
        return Ok(false);
    }
    git(&["add", "-A"])?;
    let status = git(&["status", "--porcelain"])?;
    if status.trim().is_empty() {
        return Ok(false);
    }
    git(&["commit", "-q", "-m", &message])?;
    if !git(&["remote"]).unwrap_or_default().trim().is_empty() {
        // o envio roda em segundo plano; se falhar, a janela avisa (o commit local já está salvo)
        std::thread::spawn(move || {
            if let Err(e) = git(&["push", "-q"]) {
                let _ = app.emit("planos://push-failed", e.trim().to_string());
            }
        });
    }
    Ok(true)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Env {
    root: String,
    home: String,
    has_orca: bool,
    has_claude_app: bool,
    has_claude: bool,
    has_codex: bool,
    has_git: bool,
    has_node: bool,
    has_gh: bool,
    skill_installed: bool,
    /// a skill instalada é diferente da que vem nesta versão do app
    skill_outdated: bool,
    cli_installed: bool,
}

#[tauri::command]
fn environment() -> Env {
    Env {
        root: root().display().to_string(),
        home: home().display().to_string(),
        has_orca: which("orca").is_some(),
        has_claude_app: Path::new("/Applications/Claude.app").exists(),
        has_claude: which("claude").is_some(),
        has_codex: which("codex").is_some(),
        has_git: Command::new("/usr/bin/git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false),
        has_node: which("node").is_some() || nvm_node().is_some(),
        has_gh: which("gh").is_some(),
        skill_installed: home().join(".claude/skills/planejamento/SKILL.md").is_file(),
        // instalada, mas com alguma skill faltando ou diferente da que vem nesta versão
        skill_outdated: home().join(".claude/skills/planejamento/SKILL.md").is_file()
            && SKILLS.iter().any(|(n, md)| read_opt(&home().join(format!(".claude/skills/{n}/SKILL.md"))).map(|s| s.trim() != md.trim()).unwrap_or(true)),
        cli_installed: home().join(".local/bin/planos").is_file(),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn expand(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        home().join(rest)
    } else {
        PathBuf::from(p)
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn orca(args: &[&str], dir: &Path) -> Result<String, String> {
    let bin = which("orca").ok_or("Orca não encontrado")?;
    let out = Command::new(bin)
        .args(args)
        .env("PATH", augmented_path())
        .current_dir(dir)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { String::from_utf8_lossy(&out.stdout).trim().to_string() } else { err })
    }
}

/// Garante que a pasta esteja registrada como projeto no Orca (para planos sem worktree).
fn orca_ensure_project(dir: &Path) -> Result<(), String> {
    let list = orca(&["repo", "list", "--json"], dir)?;
    let needle = format!("\"path\":\"{}\"", dir.display());
    if list.replace(": ", ":").contains(&needle) {
        return Ok(());
    }
    orca(&["repo", "add", "--path", &dir.display().to_string(), "--json"], dir).map(|_| ())
}

fn launch_orca(agent: &str, dir: &Path, prompt: &str) -> Result<(), String> {
    // sobe o Orca se estiver fechado (rápido quando já está aberto)
    let _ = orca(&["open", "--json"], dir);
    orca(
        &["agent", "launch", "--agent", agent, "--worktree", &format!("path:{}", dir.display()), "--prompt", prompt, "--focus", "--json"],
        dir,
    )?;
    let _ = Command::new("open").args(["-a", "Orca"]).spawn();
    Ok(())
}

fn launch_terminal(agent: &str, dir: &Path, prompt: &str) -> Result<(), String> {
    // grava o prompt num arquivo para não sofrer com aspas
    let tmp = std::env::temp_dir().join(format!(
        "planos-prompt-{}.txt",
        std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
    ));
    fs::write(&tmp, prompt).map_err(|e| e.to_string())?;
    let cmd = format!(
        "cd {} && {} \"$(cat {})\"",
        shell_quote(&dir.display().to_string()),
        agent,
        shell_quote(&tmp.display().to_string())
    );
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
        cmd.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let o = Command::new("osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
    if o.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&o.stderr).to_string())
    }
}

/// Abre Claude ou Codex com o contexto pronto, onde o usuário escolheu:
/// - `claude-app`: nova sessão no Claude Code do app do Claude (`claude://code/new`), só para o Claude;
/// - `orca`: `orca agent launch` no worktree do plano ou, sem worktree, na pasta dos planos;
/// - `terminal`: Terminal.app.
/// Se o destino escolhido não der, cai para o próximo e devolve onde abriu.
#[tauri::command]
fn launch_agent(agent: String, worktree: Option<String>, cwd: String, prompt: String, opener: String) -> Result<String, String> {
    if agent != "claude" && agent != "codex" {
        return Err("agente desconhecido".into());
    }
    let wt = worktree.filter(|w| !w.trim().is_empty()).map(|w| expand(&w)).filter(|w| w.is_dir());
    let dir = wt.clone().unwrap_or_else(|| expand(&cwd));

    if opener == "claude-app" && agent == "claude" && Path::new("/Applications/Claude.app").exists() {
        let url = format!("claude://code/new?folder={}&q={}", url_encode(&dir.display().to_string()), url_encode(prompt.chars().take(14_000).collect::<String>().as_str()));
        if Command::new("open").arg(&url).status().map(|s| s.success()).unwrap_or(false) {
            return Ok("claude-app".into());
        }
    }

    if opener != "terminal" && which("orca").is_some() {
        // sem worktree, a sessão abre na raiz dos planos, registrada como projeto no Orca
        let target = match &wt {
            Some(w) => Ok(w.clone()),
            None => {
                let r = root();
                orca_ensure_project(&r).map(|_| r)
            }
        };
        if let Ok(t) = target {
            // pasta de código que o Orca ainda não conhece: registra e tenta de novo
            if launch_orca(&agent, &t, &prompt).is_ok() || (orca_ensure_project(&t).is_ok() && launch_orca(&agent, &t, &prompt).is_ok()) {
                return Ok("orca".into());
            }
        }
    }

    launch_terminal(&agent, &dir, &prompt).map(|_| "terminal".into())
}

/// Abre um arquivo/pasta da raiz no app padrão, ou revela no Finder.
#[tauri::command]
fn open_path(rel: String, reveal: bool) -> Result<(), String> {
    let p = if rel.is_empty() { root() } else { safe_join(&root(), &rel)? };
    let mut c = Command::new("open");
    if reveal {
        c.arg("-R");
    }
    c.arg(&p).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Abre um caminho absoluto fora da raiz (worktree, documento original) — só leitura/abrir.
#[tauri::command]
fn open_external_path(path: String) -> Result<(), String> {
    let p = expand(&path);
    if !p.exists() {
        return Err(format!("não encontrado: {}", p.display()));
    }
    Command::new("open").arg(&p).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// "dono/repo" do GitHub de cada worktree (remote origin), para transformar #123 em link do PR.
#[tauri::command]
fn git_remotes(paths: Vec<String>) -> Vec<(String, Option<String>)> {
    paths
        .into_iter()
        .map(|p| {
            let dir = expand(&p);
            let repo = if dir.is_dir() {
                Command::new("git")
                    .args(["-C", &dir.display().to_string(), "remote", "get-url", "origin"])
                    .output()
                    .ok()
                    .filter(|o| o.status.success())
                    .and_then(|o| github_repo(String::from_utf8_lossy(&o.stdout).trim()))
            } else {
                None
            };
            (p, repo)
        })
        .collect()
}

fn github_repo(url: &str) -> Option<String> {
    let rest = url.split("github.com").nth(1)?.trim_start_matches([':', '/']);
    let rest = rest.trim_end_matches('/').trim_end_matches(".git");
    let mut it = rest.split('/');
    let (owner, name) = (it.next()?, it.next()?);
    (!owner.is_empty() && !name.is_empty()).then(|| format!("{owner}/{name}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRepo {
    path: String,
    /// dono/repo do GitHub (remote origin)
    repo: String,
    branch: String,
    /// worktree do git (`.git` é arquivo), não o clone principal
    worktree: bool,
}

/// Clones de repositórios do GitHub nas pastas de código de sempre, para abrir a IA no código do plano.
#[tauri::command]
async fn local_repos() -> Vec<LocalRepo> {
    let h = home();
    let roots = [("Documents", 4), ("orca", 4), ("code", 3), ("dev", 3), ("Projects", 3), ("Developer", 3), ("src", 3), ("repos", 3)];
    let mut dirs = Vec::new();
    for (r, depth) in roots {
        scan_git_dirs(&h.join(r), depth, &mut dirs);
    }
    dirs.into_iter()
        .filter_map(|d| {
            let run = |args: &[&str]| {
                Command::new("git")
                    .arg("-C")
                    .arg(&d)
                    .args(args)
                    .output()
                    .ok()
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            };
            let repo = github_repo(&run(&["remote", "get-url", "origin"])?)?;
            Some(LocalRepo {
                repo,
                branch: run(&["branch", "--show-current"]).unwrap_or_default(),
                worktree: d.join(".git").is_file(),
                path: d.display().to_string(),
            })
        })
        .collect()
}

fn scan_git_dirs(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    if dir.join(".git").exists() {
        out.push(dir.to_path_buf());
        return;
    }
    if depth == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            scan_git_dirs(&e.path(), depth - 1, out);
        }
    }
}

/// Abre um link no Google Chrome; sem o Chrome, no navegador padrão.
#[tauri::command]
fn open_in_chrome(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("só links https".into());
    }
    if Path::new("/Applications/Google Chrome.app").exists()
        && Command::new("open").args(["-a", "Google Chrome", &url]).status().map(|s| s.success()).unwrap_or(false)
    {
        return Ok(());
    }
    Command::new("open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    expand(&path).exists()
}

/// Instala a skill `planejamento` no Claude e o mesmo padrão no AGENTS.md global do Codex.
#[tauri::command]
fn install_skill() -> Result<String, String> {
    let skill = home().join(".claude/skills/planejamento");
    fs::create_dir_all(&skill).map_err(|e| e.to_string())?;
    for (name, md) in SKILLS {
        let dir = home().join(".claude/skills").join(name);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join("SKILL.md"), md).map_err(|e| e.to_string())?;
    }

    let codex = home().join(".codex");
    fs::create_dir_all(&codex).map_err(|e| e.to_string())?;
    let agents = codex.join("AGENTS.md");
    let current = read_opt(&agents).unwrap_or_default();
    let body = SKILL_MD.splitn(3, "---").nth(2).unwrap_or(SKILL_MD).trim();
    let block = format!("{AGENTS_BEGIN}\n{body}\n{AGENTS_END}");
    let next = match (current.find(AGENTS_BEGIN), current.find(AGENTS_END)) {
        (Some(a), Some(b)) if b > a => {
            format!("{}{}{}", &current[..a], block, &current[b + AGENTS_END.len()..])
        }
        _ if current.trim().is_empty() => format!("{block}\n"),
        _ => format!("{}\n\n{block}\n", current.trim_end()),
    };
    fs::write(&agents, next).map_err(|e| e.to_string())?;
    Ok(skill.display().to_string())
}

/// node instalado pelo nvm (fora do PATH do app), o mesmo que o comando `planos` procura
fn nvm_node() -> Option<PathBuf> {
    let mut found: Vec<PathBuf> = fs::read_dir(home().join(".nvm/versions/node")).ok()?.flatten().map(|e| e.path().join("bin/node")).filter(|p| p.is_file()).collect();
    found.sort();
    found.pop()
}

/// Login do GitHub no `gh` (None se o gh não existe ou não está logado). Separado do environment porque vai à rede.
#[tauri::command]
async fn gh_user() -> Option<String> {
    let bin = which("gh")?;
    let out = Command::new(bin).args(["api", "user", "--jq", ".login"]).env("PATH", augmented_path()).output().ok()?;
    let login = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !login.is_empty()).then_some(login)
}

/// Salva a skill planejamento num .zip em ~/Downloads, no formato que o claude.ai aceita em Ajustes → Skills.
#[tauri::command]
fn export_skill_zip() -> Result<String, String> {
    let tmp = std::env::temp_dir().join(format!("letco-skill-{}", std::process::id()));
    let dir = tmp.join("planejamento");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("SKILL.md"), SKILL_MD).map_err(|e| e.to_string())?;
    let dest = home().join("Downloads/planejamento-skill.zip");
    let _ = fs::remove_file(&dest);
    let out = Command::new("/usr/bin/ditto").args(["-c", "-k", "--keepParent"]).arg(&dir).arg(&dest).output().map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&tmp);
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let _ = Command::new("open").arg("-R").arg(&dest).spawn();
    Ok(dest.display().to_string())
}

/// Instala o comando `planos` em ~/.local/bin, apontando para o script que vem dentro do app.
#[tauri::command]
fn install_cli(app: AppHandle) -> Result<String, String> {
    let script = app.path().resource_dir().map_err(|e| e.to_string())?.join("planos.mjs");
    if !script.is_file() {
        return Err(format!("não encontrei {}", script.display()));
    }
    let bin = home().join(".local/bin");
    fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
    let target = bin.join("planos");
    let wrapper = format!(
        "#!/bin/sh\n# instalado pelo app Letco\nNODE=$(command -v node || ls -d \"$HOME\"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)\n[ -n \"$NODE\" ] || {{ echo 'planos precisa do Node.js' >&2; exit 1; }}\nexec \"$NODE\" {} \"$@\"\n",
        shell_quote(&script.display().to_string())
    );
    fs::write(&target, wrapper).map_err(|e| e.to_string())?;
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&target, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    Ok(target.display().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStamp {
    path: String,
    mtime: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoutinesRaw {
    /// conteúdo de cada scheduled-tasks.json do app do Claude (um por conta)
    claude_tasks: Vec<String>,
    /// (id, SKILL.md) de ~/.claude/scheduled-tasks
    claude_skills: Vec<(String, String)>,
    /// sessões abertas pelas tarefas agendadas do Claude nos últimos dias (uma por execução)
    claude_runs: Vec<ClaudeRun>,
    hermes_jobs: Option<String>,
    hermes_heartbeat: Option<String>,
    /// (id do job, saída mais recente)
    hermes_outputs: Vec<(String, FileStamp)>,
    /// rotinas do comando planos no launchd: (label, instalada)
    planos_launchd: Vec<(String, bool)>,
    openbot_installed: bool,
    openbot_files: Vec<FileStamp>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeRun {
    task: String,
    session: String,
    started: u64,
    last_activity: u64,
    /// turnos concluídos (sem nenhum, a sessão parou antes de terminar o primeiro)
    turns: u64,
    /// resumo do fim do turno: completed, blocked, failed…
    status: Option<String>,
    detail: Option<String>,
}

/// Lê o JSON de uma sessão do app do Claude e devolve a execução, se ela veio de uma tarefa agendada.
fn claude_run(p: &Path) -> Option<ClaudeRun> {
    let text = fs::read_to_string(p).ok()?;
    if !text.contains("\"scheduledTaskId\"") {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let summary = v.get("postTurnSummary");
    let field = |k: &str| summary.and_then(|s| s.get(k)).and_then(|x| x.as_str()).map(String::from);
    Some(ClaudeRun {
        task: v.get("scheduledTaskId")?.as_str()?.to_string(),
        session: v.get("sessionId")?.as_str()?.to_string(),
        started: v.get("createdAt")?.as_u64()?,
        last_activity: v.get("lastActivityAt").and_then(|x| x.as_u64()).unwrap_or(0),
        turns: v.get("completedTurns").and_then(|x| x.as_u64()).unwrap_or(0),
        status: field("status_category"),
        detail: field("status_detail"),
    })
}

fn stamp(p: &Path) -> FileStamp {
    FileStamp { path: p.display().to_string(), mtime: mtime(p) }
}

/// Lê (sem alterar) os agendamentos que existem no Mac: Claude, Hermes, Letco e OpenBot.
#[tauri::command]
fn load_routines() -> RoutinesRaw {
    let h = home();
    let mut claude_tasks = vec![];
    let mut claude_runs = vec![];
    // só sessões mexidas nos últimos 3 dias: bastam para a linha do tempo de hoje e a última execução
    let recent = SystemTime::now().checked_sub(Duration::from_secs(3 * 86_400)).unwrap_or(UNIX_EPOCH);
    if let Ok(accounts) = fs::read_dir(h.join("Library/Application Support/Claude/claude-code-sessions")) {
        for a in accounts.flatten() {
            if let Ok(orgs) = fs::read_dir(a.path()) {
                for o in orgs.flatten() {
                    if let Some(c) = read_opt(&o.path().join("scheduled-tasks.json")) {
                        claude_tasks.push(c);
                    }
                    for e in fs::read_dir(o.path()).into_iter().flatten().flatten() {
                        let name = e.file_name();
                        let name = name.to_string_lossy();
                        if !name.starts_with("local_") || !name.ends_with(".json") {
                            continue;
                        }
                        if e.metadata().and_then(|m| m.modified()).map_or(true, |m| m < recent) {
                            continue;
                        }
                        claude_runs.extend(claude_run(&e.path()));
                    }
                }
            }
        }
    }
    let mut claude_skills = vec![];
    if let Ok(entries) = fs::read_dir(h.join(".claude/scheduled-tasks")) {
        for e in entries.flatten() {
            if let Some(c) = read_opt(&e.path().join("SKILL.md")) {
                claude_skills.push((e.file_name().to_string_lossy().to_string(), c));
            }
        }
    }
    let cron = h.join(".hermes/cron");
    let mut hermes_outputs = vec![];
    if let Ok(entries) = fs::read_dir(cron.join("output")) {
        for e in entries.flatten() {
            let latest = fs::read_dir(e.path())
                .into_iter()
                .flatten()
                .flatten()
                .map(|f| f.path())
                .filter(|p| p.extension().is_some_and(|x| x == "md"))
                .max_by_key(|p| mtime(p));
            if let Some(p) = latest {
                hermes_outputs.push((e.file_name().to_string_lossy().to_string(), stamp(&p)));
            }
        }
    }
    let planos_launchd = ["dev.leco.planos.hoje", "dev.leco.planos.semana"]
        .iter()
        .map(|l| (l.to_string(), h.join(format!("Library/LaunchAgents/{l}.plist")).is_file()))
        .collect();
    let mut openbot_files = vec![];
    if let Ok(entries) = fs::read_dir(h.join("OpenBot/Shared/Planos")) {
        for e in entries.flatten() {
            if e.path().extension().is_some_and(|x| x == "md") {
                openbot_files.push(stamp(&e.path()));
            }
        }
    }
    RoutinesRaw {
        claude_tasks,
        claude_skills,
        claude_runs,
        hermes_jobs: read_opt(&cron.join("jobs.json")),
        hermes_heartbeat: read_opt(&cron.join("ticker_heartbeat")),
        hermes_outputs,
        planos_launchd,
        openbot_installed: Path::new("/Applications/OpenBot.app").exists(),
        openbot_files,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostFile {
    /// pasta do post relativa à raiz (divulgacao/<campanha>/<pasta>)
    dir: String,
    campaign: String,
    folder: String,
    /// imagem.png relativa à raiz, se existir
    image: Option<String>,
    legenda: Option<String>,
    post: Option<String>,
    mtime: u64,
}

/// Posts de divulgação prontos: divulgacao/<campanha>/<pasta>/ com imagem.png, legenda.md e post.md.
#[tauri::command]
fn load_posts() -> Vec<PostFile> {
    let base = root().join("divulgacao");
    let mut out = vec![];
    for c in fs::read_dir(&base).into_iter().flatten().flatten() {
        let campaign = c.file_name().to_string_lossy().to_string();
        if campaign.starts_with('.') || !c.path().is_dir() {
            continue;
        }
        for f in fs::read_dir(c.path()).into_iter().flatten().flatten() {
            let folder = f.file_name().to_string_lossy().to_string();
            let dir = f.path();
            if folder.starts_with('.') || !dir.is_dir() {
                continue;
            }
            let rel = format!("divulgacao/{campaign}/{folder}");
            let img = dir.join("imagem.png");
            // só é post a pasta com imagem, legenda ou post.md (ferramentas/ e afins ficam de fora)
            if !img.is_file() && !dir.join("legenda.md").is_file() && !dir.join("post.md").is_file() {
                continue;
            }
            out.push(PostFile {
                image: img.is_file().then(|| format!("{rel}/imagem.png")),
                legenda: read_opt(&dir.join("legenda.md")),
                post: read_opt(&dir.join("post.md")),
                mtime: mtime(&img).max(mtime(&dir.join("legenda.md"))),
                dir: rel,
                campaign: campaign.clone(),
                folder,
            });
        }
    }
    out
}

pub(crate) fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    s
}

/// Imagem dentro da raiz como data URL (para mostrar no app).
#[tauri::command]
fn read_image(rel: String) -> Result<String, String> {
    let p = safe_join(&root(), &rel)?;
    let bytes = fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))?;
    Ok(format!("data:image/png;base64,{}", base64(&bytes)))
}

/// Põe uma imagem PNG de dentro da raiz na área de transferência (para colar no Discord).
#[tauri::command]
fn copy_image(rel: String) -> Result<(), String> {
    let p = safe_join(&root(), &rel)?;
    if !p.is_file() {
        return Err(format!("não encontrado: {}", p.display()));
    }
    let path = p.display().to_string().replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!("set the clipboard to (read (POSIX file \"{path}\") as «class PNGf»)");
    let out = Command::new("osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
    if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordData {
    /// tarefas/AAAA-MM-DD.md dos últimos 14 arquivos: (nome, conteúdo)
    tarefas: Vec<(String, String)>,
    /// projetos/<projeto>/conversas/AAAA-MM-DD.md: (projeto, nome, conteúdo)
    conversas: Vec<(String, String, String)>,
    /// .indice/discord/<canal>.json: (id do canal, conteúdo)
    estado: Vec<(String, String)>,
}

fn md_files(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".md") && !n.starts_with('.'))
        .collect();
    names.sort();
    names
}

/// Resumos do dia (resumos/AAAA-MM-DD.md), do mais novo para o mais velho: [nome do arquivo, conteúdo].
#[tauri::command]
fn load_resumos() -> Vec<(String, String)> {
    let dir = root().join("resumos");
    md_files(&dir)
        .into_iter()
        .rev()
        .take(60)
        .filter_map(|n| read_opt(&dir.join(&n)).map(|c| (n, c)))
        .collect()
}

/// O que a aba Discord mostra além dos planos: tarefas recentes, resumos das conversas e a última leitura de cada canal.
#[tauri::command]
fn load_discord() -> DiscordData {
    let r = root();
    let tdir = r.join("tarefas");
    let names = md_files(&tdir);
    let tarefas = names
        .iter()
        .rev()
        .take(14)
        .filter_map(|n| read_opt(&tdir.join(n)).map(|c| (n.clone(), c)))
        .collect();
    let mut conversas = vec![];
    for p in fs::read_dir(r.join("projetos")).into_iter().flatten().flatten() {
        let slug = p.file_name().to_string_lossy().to_string();
        let cdir = p.path().join("conversas");
        for n in md_files(&cdir).into_iter().rev().take(30) {
            if let Some(c) = read_opt(&cdir.join(&n)) {
                conversas.push((slug.clone(), n, c));
            }
        }
    }
    let estado = fs::read_dir(r.join(".indice/discord"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            let id = n.strip_suffix(".json")?.to_string();
            read_opt(&e.path()).map(|c| (id, c))
        })
        .collect();
    DiscordData { tarefas, conversas, estado }
}

const DISCORD_SERVICE: &str = "dev.leco.planos.discord";

/// Guarda no Keychain o token do Discord que o usuário colou (só leitura dos canais em discord/canais.yaml).
/// O token nunca volta para o app nem vai para arquivo.
#[tauri::command]
fn discord_token_set(token: String) -> Result<(), String> {
    let t = token.trim();
    if t.len() < 20 || t.len() > 200 || !t.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
        return Err("token inválido (cole só o valor, sem aspas nem \"Bearer\")".into());
    }
    let out = Command::new("security")
        .args(["add-generic-password", "-U", "-s", DISCORD_SERVICE, "-a", "token", "-w", t])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
}

/// Se há token guardado (sem ler o valor).
#[tauri::command]
fn discord_token_status() -> bool {
    Command::new("security")
        .args(["find-generic-password", "-s", DISCORD_SERVICE, "-a", "token"])
        .output()
        .is_ok_and(|o| o.status.success())
}

#[tauri::command]
fn discord_token_clear() -> Result<(), String> {
    let out = Command::new("security").args(["delete-generic-password", "-s", DISCORD_SERVICE, "-a", "token"]).output().map_err(|e| e.to_string())?;
    if out.status.success() { Ok(()) } else { Err("não havia token guardado".into()) }
}

/// Abre no app do Claude a sessão de uma execução agendada.
#[tauri::command]
fn open_claude_session(id: String) -> Result<(), String> {
    let ok = id.len() <= 70 && id.starts_with("local_") && id[6..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !ok {
        return Err("sessão inválida".into());
    }
    Command::new("open").arg(format!("claude://code/continue?session={id}")).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Pausa ou retoma um job do Hermes pelo próprio comando dele.
#[tauri::command]
fn hermes_cron(action: String, id: String) -> Result<String, String> {
    if action != "pause" && action != "resume" {
        return Err("ação inválida".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("id inválido".into());
    }
    let bin = which("hermes").ok_or("comando hermes não encontrado")?;
    let out = Command::new(bin).args(["cron", &action, &id]).env("PATH", augmented_path()).output().map_err(|e| e.to_string())?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr)).trim().to_string();
    if out.status.success() { Ok(text) } else { Err(text) }
}

/// Liga ou desliga as rotinas do comando planos no launchd (`planos agendar`).
#[tauri::command]
fn planos_schedule(app: AppHandle, on: bool) -> Result<String, String> {
    let script = app.path().resource_dir().map_err(|e| e.to_string())?.join("planos.mjs");
    let node = which("node").ok_or("Node.js não encontrado")?;
    let mut c = Command::new(node);
    c.arg(&script).arg("agendar");
    if !on {
        c.arg("--remover");
    }
    let out = c.env("PATH", augmented_path()).env("NO_COLOR", "1").output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() { Ok(text) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
}

/// Observa a raiz e avisa o front quando algo muda (fora do .git e .indice).
fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let r = root();
        // espera a pasta existir (o onboarding pode criá-la depois)
        while !r.exists() {
            std::thread::sleep(Duration::from_secs(2));
        }
        let (tx, rx) = channel();
        let Ok(mut watcher) = notify::recommended_watcher(tx) else { return };
        if watcher.watch(&r, RecursiveMode::Recursive).is_err() {
            return;
        }
        let mut last = Instant::now() - Duration::from_secs(10);
        let mut pending = false;
        loop {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(Ok(ev)) => {
                    let relevant = ev.paths.iter().any(|p| {
                        let s = p.to_string_lossy();
                        !s.contains("/.git/") && !s.contains("/.indice/") && !s.ends_with(".tmp")
                    });
                    if relevant {
                        pending = true;
                    }
                }
                Ok(Err(_)) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => break,
            }
            if pending && last.elapsed() > Duration::from_millis(400) {
                pending = false;
                last = Instant::now();
                let _ = app.emit("planos://changed", ());
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // a janela só mostra o próprio app: link de fora (ex.: "Abrir link" do menu do botão direito) abre no navegador
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("links-fora")
                .on_navigation(|_, url| {
                    let own = matches!(url.scheme(), "tauri" | "asset" | "ipc" | "data" | "about" | "blob")
                        || matches!(url.host_str(), Some("localhost" | "tauri.localhost" | "127.0.0.1"));
                    if !own && matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = Command::new("open").arg(url.as_str()).spawn();
                    }
                    own
                })
                .build(),
        )
        .manage(console::Console::default())
        .setup(|app| {
            start_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            console::console_start,
            console::console_write,
            console::console_resize,
            console::console_stop,
            read_text,
            write_text,
            move_file,
            init_workspace,
            git_commit,
            install_cli,
            load_routines,
            hermes_cron,
            open_claude_session,
            discord_token_set,
            load_discord,
            load_resumos,
            discord_token_status,
            discord_token_clear,
            load_posts,
            read_image,
            copy_image,
            planos_schedule,
            git_remotes,
            local_repos,
            open_in_chrome,
            environment,
            launch_agent,
            open_path,
            open_external_path,
            path_exists,
            install_skill,
            gh_user,
            load_documents,
            import_dropped,
            export_skill_zip,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Letco");
}

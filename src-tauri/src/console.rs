//! Console: um terminal dentro do app rodando o Claude Code em `~/planos`,
//! para o usuário controlar a ferramenta conversando. A sessão continua viva
//! quando a aba fecha; ao voltar, o app recebe o que já saiu na tela.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// o quanto de saída guardamos para redesenhar a tela ao voltar para a aba
const KEEP: usize = 512 * 1024;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    buffer: Arc<Mutex<Vec<u8>>>,
}

#[derive(Default)]
pub struct Console(Mutex<Option<Session>>);

fn alive(s: &mut Session) -> bool {
    matches!(s.child.try_wait(), Ok(None))
}

/// Abre o Claude Code no terminal (ou reaproveita o que já está rodando) e devolve a saída até agora.
#[tauri::command]
pub fn console_start(app: AppHandle, state: State<Console>, prompt: String, cols: u16, rows: u16) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(s) = guard.as_mut() {
        if alive(s) {
            let _ = s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
            return Ok(crate::base64(&s.buffer.lock().map_err(|e| e.to_string())?));
        }
    }
    let claude = crate::which("claude").ok_or("comando claude não encontrado (instale o Claude Code)")?;
    let pty = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(claude);
    cmd.args(["--name", "Letco: console", "--append-system-prompt", &prompt]);
    cmd.cwd(crate::root());
    // o app pode ter sido aberto de dentro de outra sessão do Claude Code: sem essas variáveis,
    // o console é uma sessão normal (com histórico salvo), não uma subsessão
    for (k, _) in std::env::vars() {
        if k.starts_with("CLAUDE") || k.starts_with("ANTHROPIC_") || k.starts_with("ORCA_") {
            cmd.env_remove(k);
        }
    }
    cmd.env("PATH", crate::augmented_path());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "pt_BR.UTF-8");
    let child = pty.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pty.slave);
    let mut reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty.master.take_writer().map_err(|e| e.to_string())?;
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let buf = buffer.clone();
    std::thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if let Ok(mut b) = buf.lock() {
                        b.extend_from_slice(&chunk[..n]);
                        if b.len() > KEEP {
                            let cut = b.len() - KEEP;
                            b.drain(..cut);
                        }
                    }
                    let _ = app.emit("console://data", crate::base64(&chunk[..n]));
                }
            }
        }
        let _ = app.emit("console://exit", ());
    });
    *guard = Some(Session { master: pty.master, writer, child, buffer });
    Ok(String::new())
}

#[tauri::command]
pub fn console_write(state: State<Console>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let s = guard.as_mut().ok_or("o console não está aberto")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn console_resize(state: State<Console>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(s) = guard.as_ref() {
        s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Encerra a sessão atual (o próximo console_start abre uma nova).
#[tauri::command]
pub fn console_stop(state: State<Console>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut s) = guard.take() {
        let _ = s.child.kill();
    }
    Ok(())
}

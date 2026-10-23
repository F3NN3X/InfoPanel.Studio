// A console program: the agents run it as a hook or statusline command, so it never opens a window.
// It never fails the agent: a panic is swallowed and the exit code is always 0.

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    let env_url = std::env::var("DASHBOARD_URL").ok();
    let _ = std::panic::catch_unwind(|| ips_agent::run(&args, env_url.as_deref()));
    std::process::exit(0);
}

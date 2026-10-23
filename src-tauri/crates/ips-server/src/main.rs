// The standalone server: the environment server.mjs reads, the same start line on stdout, logs on stderr. Ctrl+C
// stops it gracefully.

use ips_server::{bind, ServerConfig};

/// Every log line on stderr, as it is.
struct StderrLog;

impl log::Log for StderrLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        if record.target() == "server" {
            eprintln!("{}", record.args());
        }
    }

    fn flush(&self) {}
}

#[tokio::main]
async fn main() {
    let _ = log::set_logger(&StderrLog).map(|()| log::set_max_level(log::LevelFilter::Info));
    let cfg = match ServerConfig::from_env() {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    let bound = match bind(cfg).await {
        Ok(bound) => bound,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    bound
        .serve(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await;
}

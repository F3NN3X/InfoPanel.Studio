// The background tasks' keeper (control tick, alerts reader, calendar, OBS, sweeps): each runs on its own task; when
// one panics or ends it is logged and started again after a backoff, until the server stops.

use std::future::Future;
use std::time::Duration;

use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::Instant;

const FIRST_DELAY: Duration = Duration::from_secs(1);
const MAX_DELAY: Duration = Duration::from_secs(60);
/// A run this long counts as healthy: the next restart waits the first delay again.
const HEALTHY: Duration = Duration::from_secs(60);

/// Runs `make()`'s task under supervision until `shutdown` is set.
pub fn spawn<F, Fut>(name: &'static str, shutdown: watch::Receiver<bool>, make: F) -> JoinHandle<()>
where
    F: Fn() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    spawn_with(name, shutdown, FIRST_DELAY, make)
}

fn spawn_with<F, Fut>(name: &'static str, mut shutdown: watch::Receiver<bool>, first_delay: Duration, make: F) -> JoinHandle<()>
where
    F: Fn() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        let mut delay = first_delay;
        loop {
            let started = Instant::now();
            let mut task = tokio::spawn(make());
            let outcome = tokio::select! {
                outcome = &mut task => outcome,
                _ = shutdown.wait_for(|stop| *stop) => {
                    task.abort();
                    return;
                }
            };
            match outcome {
                Ok(()) => log::warn!(target: "server", "{name} stopped; restarting in {} ms", delay.as_millis()),
                Err(e) => log::error!(target: "server", "{name} failed: {e}; restarting in {} ms", delay.as_millis()),
            }
            if started.elapsed() >= HEALTHY {
                delay = first_delay;
            }
            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                _ = shutdown.wait_for(|stop| *stop) => return,
            }
            delay = (delay * 2).min(MAX_DELAY);
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn restarts_a_task_that_panics_until_shutdown() {
        let (stop, shutdown) = watch::channel(false);
        let runs = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&runs);
        let handle = spawn_with("test", shutdown, Duration::from_millis(1), move || {
            let runs = Arc::clone(&counted);
            async move {
                if runs.fetch_add(1, Ordering::SeqCst) < 2 {
                    panic!("boom");
                }
                std::future::pending::<()>().await;
            }
        });
        for _ in 0..200 {
            if runs.load(Ordering::SeqCst) >= 3 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert_eq!(runs.load(Ordering::SeqCst), 3);
        stop.send(true).unwrap();
        handle.await.unwrap();
    }
}

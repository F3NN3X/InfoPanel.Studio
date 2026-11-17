# The Linux side of CI, on a machine of your own (tools/remote-linux.mjs): the Playwright image CI's browsers and fonts come
# from, at the version package.json pins, plus Rust for the ips-server debug build the e2e specs serve from.
ARG PW_VERSION
FROM mcr.microsoft.com/playwright:v${PW_VERSION}-noble
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/opt/rustup PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | CARGO_HOME=/opt/cargo sh -s -- -y --profile minimal --default-toolchain stable \
  && chmod -R a+rwX /opt/cargo /opt/rustup

---
layout: home
title: Odin
titleTemplate: Developer hub

hero:
  name: Odin
  text: An agent that runs the work, not just the words.
  tagline: Self-hosted execution agent for Discord — shell and SSH, browser, schedules, sub-agents, knowledge, and a management WebUI, all inside limits you set.
  image:
    src: /logo.svg
    alt: Odin
  actions:
    - theme: brand
      text: Install
      link: /install
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: GitHub
      link: https://github.com/Calmingstorm/Odin

features:
  - icon: ⌘
    title: 74 built-in tools
    details: Shell and SSH on registered hosts, context-checked patches, background processes, browser automation, web, email, Docker, Kubernetes, Terraform.
    link: /reference/tools
    linkText: Tool reference
  - icon: ⧉
    title: Sub-agents and loops
    details: Spawn isolated agents, message them mid-run, wait for snapshots, and read complete results by cursor. Autonomous loops with explicit limits.
    link: /agent-result-delivery
    linkText: How results are delivered
  - icon: ⏱
    title: Scheduled operations
    details: Cron and one-time schedules, webhook-triggered workflows, delegated background tasks — output posted back to the originating channel.
    link: /configuration
    linkText: Configuration
  - icon: ☰
    title: Management WebUI
    details: Live execution viewer, agents, processes, schedules, audit, sessions, usage, hosts, config, turn state — 211 REST routes behind it.
    link: /reference/api
    linkText: API reference
  - icon: ⊘
    title: Bounded by policy
    details: Permission tiers, per-user host access, a command governor, secret redaction, and an audit log with optional HMAC tamper evidence. Odin executes what it is asked, inside what it is allowed.
    link: /security
    linkText: Security model
  - icon: ⇄
    title: Three model backends
    details: OpenAI Codex over a ChatGPT subscription (GPT-6 and GPT-5.x, multi-account), Kimi, or local Ollama. Switch at runtime from the WebUI.
    link: /configuration#llm-codex
    linkText: Provider setup
---

<div class="odin-proof">
  <article><strong>74</strong><span>built-in tools · 23 core</span></article>
  <article><strong>211</strong><span>REST routes, order-pinned</span></article>
  <article><strong>11,712</strong><span>tests · 346 files</span></article>
  <article><strong>3</strong><span>model backends</span></article>
  <article><strong>MIT</strong><span>license · Debian package</span></article>
</div>

<div class="odin-exchange">
  <div class="who">operator</div>
  <p>the staging API is returning 502s since the deploy — find out why and fix it if it's safe</p>
  <div class="who">odin</div>
  <p>Probed the health endpoint → 502 in 40 ms, upstream refused. The service unit has been flapping since 14:02; the journal ends in <code>address already in use :8080</code> — the previous worker was never reaped. Killed the orphan, restarted the unit, health is 200 in 12 ms across five probes. Validation bundle passed 4/4: service active, port open, HTTP 200, no new errors in 60 s. Audit record written.</p>
  <small>An illustrative exchange — hostnames invented, behaviour real. Tool calls are recorded in the audit log and shown live in the WebUI.</small>
</div>

<div class="odin-shot">
  <img src="/webui-tools.png" alt="Odin WebUI — Capabilities → Tools: every tool, how often it has run, and a switch to remove it from the model">
  <p>WebUI · Capabilities → Tools. Every built-in tool, its usage on this install, and a per-tool switch that removes it from the model's catalog.</p>
</div>

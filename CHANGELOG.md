# Changelog

All notable changes to AskHumanToWork (todoFromAI) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-25

### Changed

- Redesigned the app with a dark "Claude Code" aesthetic built around a single
  terracotta accent, for a calmer, more focused workspace.
- The post-login home is now a **project-grouped Dashboard** showing your todos
  organized by project. The separate AI Inbox has been retired — `/inbox-ai`
  now redirects to `/dashboard`.
- The Landing / intro page is intentionally unchanged (kept light).

### Added

- **AI provenance badge** on todos, so you can see at a glance which todos were
  created by an AI agent, plus a **source filter** to show only AI-created or
  only human-created todos.
- A **per-todo AI assistant** is now surfaced directly on each todo, no longer
  tucked away.

### Behavior change

- A todo created with **no due date now defaults to +1 week at 09:00** in your
  timezone. This applies to every source, including agent / API / MCP-created
  todos.
- **Agent-created todos that previously had no due date will now get one and so
  will start sending reminders.** To keep a todo due-less (and silent), create
  it with an explicit `dueAt: null` — that opts out of the default.
- Recurrence behavior is unchanged.

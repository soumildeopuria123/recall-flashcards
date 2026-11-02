# Changelog

All notable changes to Recall will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-02

### Added
- Flashcard study app with four learning modes: Flip, Type, Learn and Match.
- FSRS-4.5 spaced-repetition scheduler with per-user, per-card `card_progress`
  state (stability, difficulty, due date, state, lapses) persisted in D1.
- Shared dataset of starter decks (25 decks / 390 cards) with visibility
  scoping: every brand-new account starts at an honest 0% mastery, streak 0
  and XP 0 — no fabricated history.
- Deck library with progress rings, due counts and hero "Start here" card.
- Per-user stats page: current/longest streak, retention, minutes studied,
  52-week heatmap and mode breakdown.
- CSV deck import/export and deck cover images stored in R2.
- Email + password auth (accounts table) with session cookies, profile and
  account/data deletion routes.
- Worker API built with Hono on Cloudflare Workers: auth, account, decks and
  session recording routes over D1 + R2 bindings.
- FSRS parameter sanity-check script (`scripts/fsrs-check.ts`).

# Contributing to VishGuard

Thank you for your interest in contributing! VishGuard is an open-source project and welcomes improvements of all kinds — bug fixes, documentation improvements, new features, and test coverage.

---

## Getting Started

1. **Fork** this repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/VishGuard.git
   cd VishGuard
   ```
3. Set up the **backend** and **frontend** by following the [local development guide](README.md#-local-development).
4. Create a **feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Project Structure

```
VishGuard/
├── backend/          ← Node.js + Express API server
├── frontend/         ← React + Vite single-page app
│   └── src/
│       ├── components/   ← UI components
│       └── hooks/        ← Custom React hooks
├── .github/workflows/    ← GitHub Actions CI/CD
├── render.yaml           ← Render.com deployment config
└── README.md
```

See [`README.md`](README.md#-project-structure) for the full annotated tree.

---

## Development Guidelines

### Code Style
- Use **ES Modules** (`import`/`export`) throughout — both backend and frontend are configured for ESM.
- Follow the existing naming conventions: `camelCase` for variables/functions, `PascalCase` for React components.
- Add **JSDoc comments** to all new functions and hooks explaining the *why*, not just the *what*.
- Keep React components focused and single-purpose.

### Commit Messages
Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat(backend): add rate limit headers to /analyze response
fix(frontend): prevent duplicate segments on Android Chrome restart
docs: update API reference with /transcribe endpoint
refactor(hooks): extract restart-delay logic into named constant
```

### Frontend
- Do not add new npm dependencies without discussion — the bundle should stay minimal.
- All new UI components go in `frontend/src/components/`.
- All new React hooks go in `frontend/src/hooks/`.
- Keep `index.css` as the single source of truth for design tokens — no inline style overrides for colours or spacing unless strictly necessary for dynamic values.

### Backend
- All new API routes go in `server.js` with the matching section header comment (`// ─── Route name ───`).
- API keys must **never** be logged, written to disk by string value, or included in any error messages.
- New routes should handle their own file cleanup in a `finally` block (see `/analyze-audio` for the pattern).

---

## Testing

### Backend smoke tests
```bash
cd backend
node test_safe.js      # should return score < 30
node test_unsafe.js    # should return score >= 70
node test_all.js       # runs all tests
```

### Manual frontend testing
1. Start both servers (see [README](README.md)).
2. Open `http://localhost:5173` in Chrome on desktop.
3. Test **Live Monitoring** — start monitoring and speak some test phrases.
4. Test **Audio File Upload** — upload an MP3 and verify the transcript and score appear.
5. On mobile (same Wi-Fi), set `VITE_BACKEND_URL` to the LAN IP and repeat the above.

---

## Submitting Changes

1. Make sure your branch is up to date with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. Push your branch and open a **Pull Request** on GitHub.
3. Describe *what* you changed and *why* in the PR description.
4. A maintainer will review and merge.

---

## Reporting Issues

Please open a [GitHub Issue](https://github.com/SolankiRaj202/VishGuard/issues) and include:
- Browser and OS version
- Steps to reproduce
- Expected vs actual behaviour
- Any relevant console errors

---

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

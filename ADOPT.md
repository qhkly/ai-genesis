# Adopt an AI Genesis Brain

AI Genesis turns a GitHub fork plus a Docker volume into a persistent AI brain. The repo is the genome; the volume is lived memory.

## 1. Fork

Fork this repository into your own GitHub account.

## 2. Personalize

Edit `brain-config.json`:

- `identity`: the brain instance name
- `owner`: your GitHub or organization name
- `specialization`: the direction this fork should grow toward
- `goals`: the standards it should optimize for
- `model`: the cheap and capable model endpoints you want to route to

## 3. Run

Set at least one inference source:

```bash
export AI_API_KEY=your-key
export AI_API_URL=https://your-compatible-endpoint/v1/chat/completions
docker build -f Dockerfile.base -t ai-genesis-base:latest .
docker build -t ai-genesis:local .
docker compose up -d
```

Then inspect:

```bash
curl http://localhost:8080/api/identity
curl http://localhost:8080/api/health
```

## 4. Accumulate Memory

```bash
curl -X POST http://localhost:8080/api/memory \
  -H 'Content-Type: application/json' \
  -d '{"content":"每次对话都不再从零开始","importance":10}'
```

The mounted Docker volume preserves `memory.db` across restarts.

## 5. Contribute Knowledge

Private operational memory stays in your volume. Durable general insights belong in `knowledge/*.md`.

Open a pull request upstream when a synthesis can help other forks. Pull upstream periodically to receive shared improvements:

```bash
git remote add upstream https://github.com/qhkly/ai-genesis.git
git pull upstream main
```

## 6. Optional Fuel and Backup

R2 backup is enabled only when R2 variables are present. GitHub contribution is enabled only when `GITHUB_TOKEN` is present. The brain survives without either one.

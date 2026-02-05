# PR Opener

Opens Chrome tabs for GitHub PR review requests.

## Requirements

- macOS
- Node.js
- [gh CLI](https://cli.github.com/) (authenticated)

## Setup

```bash
git clone https://github.com/tolluset/pr-opener.git ~/.pr-opener
```

### Zsh

```zsh
# ~/.zshrc
if [[ -o interactive ]] && ! pgrep -qf "pr-opener/index.js"; then
  (while true; do node ~/.pr-opener/index.js >> ~/.pr-opener/logs/stdout.log 2>&1; sleep 300; done) &!
fi
```

### Fish

```fish
# ~/.config/fish/config.fish
if status is-interactive && not pgrep -qf "pr-opener/index.js"
  fish -c 'while true; node ~/.pr-opener/index.js >> ~/.pr-opener/logs/stdout.log 2>&1; sleep 300; end' &
  disown
end
```

## Usage

```bash
node ~/.pr-opener/index.js            # run
node ~/.pr-opener/index.js --dry-run  # test
node ~/.pr-opener/index.js pause      # pause
node ~/.pr-opener/index.js resume     # resume
node ~/.pr-opener/index.js status     # check status
pkill -f "pr-opener/index.js"         # stop
```

## Config

Edit `~/.pr-opener/config.json`:

```json
{
  "maxTabsToOpen": 5,
  "paused": false
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `maxTabsToOpen` | 5 | Max tabs per run |
| `paused` | false | Pause notifications |

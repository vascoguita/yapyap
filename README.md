<p align="center"><img src="apps/desktop/build/icon.svg" alt="YapYap icon" width="96" height="96"></p>

# YapYap

[![CI](https://github.com/vascoguita/yapyap/actions/workflows/ci.yml/badge.svg)](https://github.com/vascoguita/yapyap/actions/workflows/ci.yml)
[![CodeQL](https://github.com/vascoguita/yapyap/actions/workflows/codeql.yml/badge.svg)](https://github.com/vascoguita/yapyap/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/vascoguita/yapyap/badge)](https://scorecard.dev/viewer/?uri=github.com/vascoguita/yapyap)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15759/badge)](https://www.bestpractices.dev/projects/15759)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fyapyap.guita.org%2Fdownloads-badge.json)](https://github.com/vascoguita/yapyap/releases)

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=coverage)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Security](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Duplicated lines](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=bugs)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Code smells](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Technical debt](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Lines of code](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)

A fast, private, extensible desktop client for WhatsApp Web, for Linux,
Windows and macOS.

> **YapYap is unofficial.** It is not affiliated with, endorsed by, or
> sponsored by WhatsApp or Meta. "WhatsApp" is a trademark of its owner.
> YapYap loads the official WhatsApp Web in a hardened desktop shell. It does
> not reimplement WhatsApp's protocol and does not automate your account.

## Install

Download YapYap for Linux, Windows or macOS from the
[releases page](https://github.com/vascoguita/yapyap/releases), or add the
apt, dnf or pacman repository at `packages.guita.org`, as the
[install guide](https://yapyap.guita.org/guide/install) explains. Each
release's changes are in [`CHANGELOG.md`](CHANGELOG.md).

## Status

YapYap is young: v0.1.0 is its first release. Follow what comes next on the
[project board](https://github.com/users/vascoguita/projects/5) and in
[`docs/progress.md`](docs/progress.md).

## Highlights

- Multiple accounts with fully isolated sessions
- Native notifications, tray or menu bar with unread counts, and do-not-disturb
- Recovery tools that fix a stuck session without logging you out
- A sandboxed, signed plugin system with per-account permissions
- An optional "bring your own model" AI writing assistant that only ever
  inserts drafts
- No telemetry

## Documentation

https://yapyap.guita.org/

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Architecture Decision Records](docs/adr/README.md). Get help through
[SUPPORT.md](SUPPORT.md), and report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).

## Support YapYap

YapYap is free, with no ads and no telemetry. If it is useful to you, you can
[sponsor its development](https://github.com/sponsors/vascoguita).
Sponsorships pay for what building YapYap costs:

- **Development tools:** a Claude subscription for AI-assisted development.
  A higher plan means fewer pauses when the usage limit runs out.
- **Code signing:** certificates for macOS and Windows, so YapYap installs
  without security warnings.

## Supporters

YapYap's development is supported by [Ensita](https://www.ensita.org/), a
nonprofit that builds free, open-source apps that keep your data yours, and
mentors new developers.

## License

[MIT](LICENSE) © Vasco Guita

# Egress Proxy (fuba-proxy)

fuba-browser インスタンスのインターネットアクセスを、共通の出口サーバー経由に統一するプロキシ基盤。

## Overview

```
[fuba-browser 1] ─┐                                    ┌──→ Internet
[fuba-browser 2] ─┤ Chromium --proxy-server             │
...               ├─→ [stunnel client :13128] ──mTLS──→ [stunnel server :3129] → [Squid :3128] ─┤
[fuba-browser N] ─┘   (各ホスト)                        (出口サーバー, systemd)   └──✕ Private IPs
```

### 提供する機能

| 機能 | 説明 |
|------|------|
| **プライベートネットワーク遮断** | DNS 解決後の実 IP で 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 等をブロック。DNS rebinding 攻撃も防御 |
| **ドメイン許可リスト** | `ALLOWLIST_MODE=true` で指定ドメインのみアクセス可能 |
| **mTLS 認証** | CA 署名済みクライアント証明書による接続制御。ホスト単位で発行・失効 |
| **キャッシュ** | Squid キャッシュにより共通 CDN リソースの帯域を節約 |
| **ポート制限** | HTTP(80) と HTTPS(443) のみ許可 |

### 性能目標

- メモリ: 1GB 以内（Squid キャッシュ 512MB + stunnel）
- 同時接続: 20 台の fuba-browser
- スループット: 最大 100 rps

## Architecture

### コンポーネント

**Squid** (HTTP プロキシ)
- `127.0.0.1:3128` のみ listen（外部から直接アクセス不可）
- `dst` ACL で DNS 解決後のIPアドレスをチェック
- `dstdomain` ACL でドメイン許可リスト管理

**stunnel** (TLS ラッパー)
- サーバー側: `0.0.0.0:3129` で mTLS 接続を受け付け、`127.0.0.1:3128` の Squid に転送
- クライアント側: `0.0.0.0:13128` で平文 HTTP を受け付け、出口サーバーの `:3129` に mTLS 接続

**Playwright / Chromium**
- `--proxy-server=http://localhost:13128`（Docker 時は `http://host.docker.internal:13128`）
- stunnel クライアント経由でプロキシにアクセス

### 認証フロー

```
Chromium → (plain HTTP) → stunnel client → (mTLS over TCP) → stunnel server → (plain HTTP) → Squid → Internet
                          cert + key                          verify client cert
                          verify server cert (CA)             cert + key
```

### 証明書の階層

```
CA (fuba-proxy CA)
├── server.pem  — 出口サーバー用（stunnel server が使用）
├── client-A.pem — ホスト A 用
├── client-B.pem — ホスト B 用
└── ...
```

## Setup

### 出口サーバー（プロキシサーバー）

対応 OS: Debian/Ubuntu, Rocky Linux/RHEL/AlmaLinux

```bash
git clone https://github.com/fuba/fuba-browser.git
cd fuba-browser

# デフォルトモード（全ドメイン許可、プライベート IP のみブロック）
sudo ./proxy/install.sh

# 許可リストモード（指定ドメインのみ許可）
sudo ALLOWLIST_MODE=true ./proxy/install.sh
```

install.sh が行うこと:
1. squid, stunnel, openssl パッケージのインストール
2. `/etc/fuba-proxy/` に設定ファイルを配置
3. CA 証明書 + サーバー証明書の生成
4. Squid キャッシュディレクトリの初期化
5. systemd サービスの登録・起動
6. SELinux ポリシー設定（RHEL 系のみ）
7. firewalld ポート開放（RHEL 系のみ）
8. 初回クライアント証明書（default-client）の生成

### クライアント証明書の配布

```bash
# 出口サーバーで: ワンタイム URL を発行
sudo ./proxy/cert-serve.sh <client-name> [port]

# fuba-browser ホストで: ダウンロード
mkdir -p ~/fuba-proxy-certs
curl -o /tmp/certs.tar.gz '<表示された URL>'
tar -xzf /tmp/certs.tar.gz -C ~/fuba-proxy-certs
rm /tmp/certs.tar.gz
```

cert-serve.sh の特徴:
- ランダムトークンによるワンタイム URL
- 1回ダウンロードで自動シャットダウン
- 10分のタイムアウト
- firewalld ポートの自動開閉（RHEL 系）

手動で証明書を生成する場合:

```bash
sudo ./proxy/cert-gen.sh <client-name>
# => /etc/fuba-proxy/clients/<client-name>/ に出力
#    client.pem, client.key, ca.pem
```

### fuba-browser ホスト側

#### 1. stunnel クライアントの設定

```bash
# stunnel インストール
sudo apt-get install -y stunnel4   # Debian/Ubuntu
sudo dnf install -y stunnel        # Rocky/RHEL

# 設定ファイル作成
cat > ~/fuba-proxy-certs/stunnel-client.conf <<EOF
pid = /tmp/fuba-proxy-stunnel-client.pid

[fuba-proxy]
client = yes
accept = 0.0.0.0:13128
connect = <出口サーバーIP>:3129
cert = /home/<user>/fuba-proxy-certs/client.pem
key = /home/<user>/fuba-proxy-certs/client.key
CAfile = /home/<user>/fuba-proxy-certs/ca.pem
verify = 2
EOF

# 起動
stunnel ~/fuba-proxy-certs/stunnel-client.conf

# 疎通確認
curl --proxy http://localhost:13128 https://www.google.com/ -o /dev/null -w "%{http_code}\n"
```

> **Note**: `accept = 0.0.0.0:13128` は Docker コンテナからのアクセスに必要です。Docker を使わない場合は `127.0.0.1:13128` に制限できます。

#### 2. fuba-browser の設定

`.env` ファイル:

```env
PROXY_SERVER=http://host.docker.internal:13128
PROXY_BYPASS=localhost,127.0.0.1
```

`docker-compose.yml` に以下が必要:

```yaml
services:
  fuba-browser:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    env_file:
      - .env
```

## Configuration

### Squid 設定 (`/etc/fuba-proxy/squid.conf`)

主要な ACL:

```squid
# プライベート IP ブロック（常時有効）
acl private_networks dst 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
acl private_networks dst 127.0.0.0/8 169.254.0.0/16 0.0.0.0/8 100.64.0.0/10
http_access deny private_networks

# ポート制限
acl Safe_ports port 80 443
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports

# localhost からのみ接続許可
acl localhost_src src 127.0.0.1/32 ::1/128
http_access allow localhost_src
http_access deny all
```

設定変更後のリロード:

```bash
sudo systemctl reload fuba-proxy
```

### 許可リストモード

`/etc/fuba-proxy/allowlist.txt`:

```
# ドメイン毎に1行。先頭の . でサブドメインも許可
.google.com
.googleapis.com
.gstatic.com
.cloudflare.com
```

編集後:

```bash
sudo systemctl reload fuba-proxy
```

### メモリチューニング

`squid.conf` のデフォルト値:

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `cache_mem` | 256 MB | インメモリキャッシュ |
| `maximum_object_size_in_memory` | 4 MB | メモリ内の最大オブジェクトサイズ |
| `cache_dir ufs ... 512` | 512 MB | ディスクキャッシュ |

## Operations

### サービス管理

```bash
# ステータス確認
sudo systemctl status fuba-proxy
sudo systemctl status fuba-proxy-tls

# 再起動
sudo systemctl restart fuba-proxy
sudo systemctl restart fuba-proxy-tls

# 設定リロード（Squid のみ、ダウンタイムなし）
sudo systemctl reload fuba-proxy
```

### ログ

```bash
# Squid アクセスログ
sudo tail -f /var/log/fuba-proxy/access.log

# Squid キャッシュログ
sudo tail -f /var/log/fuba-proxy/cache.log

# stunnel ログ
sudo journalctl -u fuba-proxy-tls -f
```

### 証明書の失効

特定ホストのアクセスを無効化するには、そのクライアント証明書を削除して stunnel を再起動:

```bash
sudo rm -rf /etc/fuba-proxy/clients/<client-name>
# Note: 現在の接続は維持されるが、新規接続は拒否される
```

より厳密な失効が必要な場合は CRL（証明書失効リスト）の運用を検討してください。

### アンインストール

```bash
sudo ./proxy/uninstall.sh                      # 設定とサービスを削除
sudo REMOVE_PACKAGES=true ./proxy/uninstall.sh  # パッケージも削除
```

### 統合テスト

```bash
sudo ./proxy/test.sh [proxy-host]
```

テスト項目:
1. HTTP アクセス（外部サイト）
2. HTTPS CONNECT（外部サイト）
3. プライベート IP ブロック（10.0.0.0/8）
4. プライベート IP ブロック（192.168.0.0/16）
5. ループバックブロック（127.0.0.0/8）
6. 非標準ポートブロック（8080）
7. クライアント証明書なしの接続拒否
8. Squid の localhost 限定リッスン確認

## File Structure

```
proxy/
├── squid.conf                  # Squid 設定
├── allowlist-acl.conf          # 許可リスト ACL（include 用）
├── allowlist.txt               # デフォルトドメイン許可リスト
├── stunnel-server.conf         # stunnel サーバー設定テンプレート
├── stunnel-client.conf.example # stunnel クライアント設定テンプレート
├── fuba-proxy.service          # Squid systemd unit
├── fuba-proxy-tls.service      # stunnel systemd unit（テンプレート）
├── install.sh                  # インストールスクリプト
├── uninstall.sh                # アンインストールスクリプト
├── cert-gen.sh                 # クライアント証明書生成
├── cert-serve.sh               # ワンタイム証明書配布サーバー
└── test.sh                     # 統合テスト

/etc/fuba-proxy/                # インストール先（出口サーバー）
├── squid.conf
├── stunnel-server.conf
├── allowlist-acl.conf
├── allowlist.txt
├── tls/
│   ├── ca.pem / ca.key         # CA 証明書
│   └── server.pem / server.key # サーバー証明書
└── clients/
    └── <name>/
        ├── client.pem          # クライアント証明書
        ├── client.key          # クライアント秘密鍵
        └── ca.pem              # CA 証明書（検証用）
```

## Troubleshooting

### stunnel クライアントが接続できない

```bash
# ポートが開いているか確認
nc -zv <出口サーバーIP> 3129 -w 5

# さくら VPS 等のパケットフィルタを確認（OS の firewall とは別）
# コントロールパネルで TCP 3129 を許可

# SSH トンネルで一時的に回避
ssh -L 13128:127.0.0.1:3128 user@exit-server -N &
```

### Docker コンテナからプロキシに接続できない (ERR_PROXY_CONNECTION_FAILED)

stunnel クライアントの `accept` を `0.0.0.0:13128` に設定する必要があります。`127.0.0.1` だと Docker ブリッジネットワークからはアクセスできません。

### Squid が起動しない (swap directories)

```bash
# キャッシュディレクトリを初期化
sudo /usr/sbin/squid -f /etc/fuba-proxy/squid.conf -z
sudo systemctl restart fuba-proxy
```

### stunnel の PID ファイル Permission denied

`/run/fuba-proxy/` の所有者が stunnel ユーザーと一致しているか確認:

```bash
ls -la /run/fuba-proxy/
# Debian: stunnel4:stunnel4
# RHEL:   nobody:nobody
```

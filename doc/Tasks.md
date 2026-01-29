# Development Tasks

## Phase 1: Foundation (High Priority)
- [x] Git初期化とGitHub privateリポジトリ作成
- [x] プロジェクト基本構造の設計・作成
  - TypeScriptプロジェクトのセットアップ
  - Playwright + Chromiumアプリケーション構造
  - REST APIサーバー基盤（Express）
- [x] Chromiumベースのブラウザ自動化基盤構築
  - Playwrightアプリケーションの初期設定
  - ブラウザコントローラーの構造設計
  - Playwright API統合

## Phase 2: Core Features (Medium Priority)
- [ ] REST APIサーバーの実装
  - APIルーティング設計
  - ミドルウェア設定
  - エラーハンドリング
- [ ] ブラウザ制御エンドポイントの実装
  - `/api/navigate` - ページ遷移
  - `/api/scroll` - スクロール操作
  - `/api/click` - クリック操作
  - `/api/type` - テキスト入力
  - `/api/screenshot` - スクリーンショット取得
- [ ] ページ内容取得とMarkdown変換機能の実装
  - DOM解析エンジン
  - Markdown拡張フォーマット設計
  - 要素フィルタリング（3%以上の面積）
- [ ] 要素の座標情報・識別情報付与機能の実装
  - 要素のbounding box計算
  - セレクタ生成
  - インタラクティブ要素の検出
- [ ] Cookie管理機能の実装
  - Cookie永続化
  - セッション管理

## Phase 3: Advanced Features (Low Priority)
- [ ] Web VNC機能の実装
  - noVNCまたは類似ライブラリの統合
  - WebSocket通信
  - 画面共有とリモート操作
- [ ] Docker環境の構築（Linux版）
  - Dockerfile作成
  - X11/Wayland対応
  - docker-compose設定
- [ ] 操作レコーディング機能の設計
  - 操作ログ記録フォーマット
  - DOMスナップショット機能
  - 再生機能の検討

## Technical Stack
- **Browser**: Playwright + Chromium
- **Backend**: Node.js + TypeScript
- **API**: Express
- **Browser Control**: Chrome DevTools Protocol
- **VNC**: noVNC
- **Container**: Docker (Linux)

## API Specification (Draft)

### Browser Control
- `POST /api/navigate` - Navigate to URL
- `POST /api/scroll` - Scroll page
- `POST /api/click` - Click element
- `POST /api/type` - Type text
- `GET /api/screenshot` - Get screenshot

### Content Extraction
- `GET /api/content` - Get page content as extended Markdown
- `GET /api/elements` - Get interactive elements info
- `GET /api/dom` - Get DOM tree

### Session Management
- `GET /api/cookies` - Get cookies
- `POST /api/cookies` - Set cookies
- `GET /api/session` - Get session info
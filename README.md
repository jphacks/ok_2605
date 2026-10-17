# のむペイ Expo開発環境

JPHACKS向けのReact Native + TypeScript + Expo（iOS）の開発用プロジェクトです。HTMLの画面検討は同じ`doc/demo/`内の`medication-ui`系を参照し、実装本体は将来`doc/App/ok_2605/`へ移します。

## 現在の画面

- `src/app/index.tsx`：くすり日和のホーム、服用予定、達成状況
- `src/app/qr.tsx`：カメラ許可、QR読み取り、読み取り結果の確認アラート
- `src/app/medications/index.tsx`：登録した薬の一覧（毎日の服用時間・ペナルティ金額）
- `src/app/medications/new.tsx`：薬の登録フォーム・入力エラー・保存失敗時の再試行
- `src/app/_layout.tsx`：Expo Routerのルートレイアウト

## 起動

```bash
cd doc/demo/expo-medication-app
npm ci
npm start
```

iOS Simulatorを起動する場合は`npm run ios`を使います。Xcode本体とSimulatorランタイムが必要です。QRカメラはiPhone実機で確認してください。SDK 57対応のExpo Go、または開発ビルドを使用します。Node.jsは24系（24.3.0以上）を使用します。

## 使用パッケージ

- Expo SDK 57
- TypeScript
- Expo Router
- `expo-camera`（QRコードは`barcodeTypes: ['qr']`に限定）
- `expo-sqlite`（端末内の`nomupay.db`に登録薬を保存）
- 状態管理はReact `useReducer`とContext。QR画面からホームへ服用状態を共有します。
- 登録薬は専用のContextと`useState`で画面間共有し、起動時にSQLiteから復元します。

## ディレクトリ

```text
expo-medication-app/
├── src/app/          # Expo Routerの画面とレイアウト
├── src/components/   # テンプレートの共通UI部品
├── src/features/medications/ # 登録入力検証・SQLite接続・保存/取得
├── src/state/        # デモQR検証・服用状態・Context
├── src/types/        # CSSなどの型宣言
├── tests/            # 登録検証・SQLite保存/復元・既存QRの回帰テスト
├── assets/           # Expoのアイコン・スプラッシュ素材
├── app.json          # Expo Router・カメラ権限の設定
├── package.json
└── tsconfig.json
```

実機では、QRの中身が`nomupay:demo:morning`の場合だけ朝のお薬のデモ記録としてホームに反映します。QRを用意できない場合は「デモ：ボタンで読み取り完了」を押して同じ完了フローを確認できます。製品版QRの形式は未確定です。他のQRは拒否し、二重読み取りと二重記録を防ぎます。設定を拒否した場合もデモボタンは利用できます。

QRデモの服用状態は再起動でリセットされます。登録薬の情報はSQLiteに保存され、アプリ再起動後も保持されます。服薬履歴、日付ごとのスケジュール、サーバー保存、決済、通知は未実装です。達成状況はサンプルです。既存テンプレートのWeb部品も残していますが、今回の対応対象はiOSです。

## 薬の登録（MED-001）

ホームの「薬を登録する」から、薬名・毎日の服用時間1つ・ペナルティ金額を入力します。保存後は一覧へ移動し、時刻順で確認できます。設定画面からも一覧・登録へ進めます。

- 薬名：前後の空白を除いて1〜100文字。名前そのものの表記は変更しません。
- 服用時間：時（00〜23）・分（00〜59）のプルダウンで選択します。初期値は09:00です。
- ペナルティ金額：100円以上の整数。空欄、負数、小数、指数表記は受け付けません。JavaScriptの安全な整数範囲を超える値も拒否します。
- 全角の時刻・金額にも対応します。保存中の連打を防ぎ、失敗時は入力を残して再試行できます。
- データはこの端末のDB内で保持します。アプリ削除やExpo Goのプロジェクトデータ削除による消失・別端末との同期は別の扱いです。
- 登録時の課金はありません。薬別QR発行・登録薬とQRの照合は別チケットで、現在のQRデモには接続していません。

### iPhoneでの確認手順

1. 依存追加後のため`npm ci`を実行し、`npm start -- --clear`でExpoを起動します。開発ビルドを使っている場合は、`expo-sqlite`追加後のビルドを使用します。
2. ホームの「薬を登録する」で、空欄のまま登録ボタンを押し、薬名・金額のエラーを確認します。
3. 「朝のビタミン」「09:00」「100」を入力して登録し、一覧に薬名・毎日の服用時間・100円が表示されることを確認します。
4. 別の薬を登録し、複数の薬が時刻順に並ぶことを確認します。
5. アプリを終了して同じExpoプロジェクトを開き直し、「登録した薬を見る」で内容が残ることを確認します。
6. 金額`99`・`-1`・`1.5`などの不正入力が保存されないことを確認します。

自動テストでは同じRepositoryをSQLite実ファイルで実行し、接続を閉じて開き直した後の復元まで確認しています。上記のiPhone画面操作は実機検証待ちです。

## 検証

- `npm run typecheck`：画面・共通部品・フック・状態を含めて合格。
- `npm run lint`：合格。
- `npm test`：登録入力の境界値・SQLite保存/再読込・SQL制約・保存失敗など11件と、既存QRの回帰2件、計13件合格。
- `npx expo install --check`：導入済みSDKの互換性マップで依存が一致。オフライン検証。
- `npm run export:ios`：JSとアセットの生成に成功。署名済みiOSアプリのビルドではありません。
- Simulator・実機カメラ・権限操作：未検証。現在のXcode選択先はCommand Line Toolsです。
- 依存追加時の監査警告：29件（high 18、moderate 11）。SDK互換性を変える強制自動修正は未適用。

pull・pushはユーザーが実施します。push版作成時は提出先を確認し、`node_modules`、`.expo`、`dist`、demo側の`.git`、ローカルDBをコピー対象から除外します。`doc/App/ok_2605/README.md`はユーザー指定により変更しません。

UI/UXは`../medication-ui-qr/`のスマホ画面が基準です。最低金額は`src/features/medications/medication.ts`の`MIN_PENALTY_AMOUNT`で変更できます。変更後はアプリを再起動するとDBの書込制限も更新されます。過去に保存した最低額未満の記録は自動で増額せず保持します。

## ペナルティ課金デモ

「設定 → ペナルティ課金（デモ）」から登録した薬・日付・服薬状況・成功/失敗を選択します。実際のお金は動きません。
失敗履歴から成功するデモで再試行できます。同じ予定の成功済み決済は重複しません。履歴は端末内SQLiteに保存されます。
猶予はデモ用30分。自動の時間超過検出や実際の服薬状態との連動は未実装です。
詳細な確認手順は ../../implementation_history/2026-10-17_MED-006_demo-payment.md を参照。
